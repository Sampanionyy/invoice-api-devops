# invoice-api-devops

Projet pédagogique M2 — déploiement d'une API Node.js sur Kubernetes avec monitoring complet et GitOps.

---

## Objectif

Ce projet couvre l'ensemble du cycle de vie d'une application en production :

- Empaqueter une application dans un conteneur Docker
- Déployer sur Kubernetes de façon reproductible avec Helm
- Surveiller en temps réel avec Prometheus et Grafana
- Centraliser les logs avec Loki
- Automatiser les déploiements via ArgoCD (GitOps)
- Automatiser le build et le push d'image via GitHub Actions (CI/CD)

---

## Architecture

```
Développeur
    |
    | Merge d'une Pull Request sur main
    v
GitHub Actions (CI)
    - Build de l'image Docker
    - Push sur DockerHub
    - Mise à jour du tag dans helm/invoice-api/values.yaml
    |
    v
ArgoCD (GitOps)
    - Détecte le changement dans le repo Git
    - Applique automatiquement le Helm chart sur Kubernetes
    |
    v
Kubernetes (Minikube)
    |
    |-- Namespace: invoice
    |       - Deployment: invoice-api (2 replicas)
    |       - Service: expose le port 3000
    |
    |-- Namespace: monitoring
    |       - Prometheus  (collecte les métriques toutes les 15s)
    |       - Grafana     (visualisation des métriques)
    |       - Loki        (centralisation des logs)
    |       - Promtail    (agent de collecte de logs)
    |
    |-- Namespace: argocd
            - ArgoCD     (synchronisation Git → Kubernetes)
```

---

## Accès aux interfaces

| Interface  | URL                     | Login | Mot de passe          |
|------------|-------------------------|-------|-----------------------|
| API        | http://localhost:3000   | —     | —                     |
| Grafana    | http://localhost:3001   | admin | voir commande ci-bas  |
| Prometheus | http://localhost:9090   | —     | —                     |
| ArgoCD     | https://localhost:8080  | admin | voir commande ci-bas  |

```bash
# Mot de passe Grafana
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode; echo

# Mot de passe ArgoCD
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 --decode; echo
```

---

## Installation initiale (une seule fois)

> À faire uniquement lors de la première installation. Ne pas répéter.

### Prérequis

```bash
minikube version
kubectl version --client
helm version
docker version
```

### 1. Démarrer Minikube

```bash
minikube start --cpus=4 --memory=6144 --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
```

### 2. Corriger les limites inotify (nécessaire pour Promtail)

```bash
minikube ssh "sudo sysctl fs.inotify.max_user_instances=512"
minikube ssh "sudo sysctl fs.inotify.max_user_watches=524288"
```

### 3. Ajouter les repos Helm

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

### 4. Créer les namespaces

```bash
kubectl create namespace invoice
kubectl create namespace monitoring
kubectl create namespace argocd
```

### 5. Installer Prometheus + Grafana

Grafana est inclus dans `kube-prometheus-stack`.

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.scrapeInterval=15s \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set alertmanager.enabled=false \
  --wait
```

### 6. Installer Loki + Promtail

```bash
helm install loki grafana/loki \
  --namespace monitoring \
  --values monitoring/loki/loki-values.yaml \
  --wait

helm install promtail grafana/promtail \
  --namespace monitoring \
  --values monitoring/loki/promtail-values.yaml \
  --wait
```

### 7. Installer ArgoCD

```bash
helm install argocd argo/argo-cd \
  --namespace argocd \
  --set server.service.type=NodePort \
  --wait
```

### 8. Déployer l'application via GitOps

```bash
kubectl apply -f gitops/argocd/invoice-api-app.yaml
```

ArgoCD va détecter le chart Helm dans `helm/invoice-api/` et déployer l'API automatiquement dans le namespace `invoice`.

### 9. Configurer Grafana

#### Ajouter Prometheus comme source de données

Grafana > Connections > Data sources > Add data source > Prometheus

```
URL : http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Cliquer sur "Save & test".

#### Ajouter Loki comme source de données

Grafana > Connections > Data sources > Add data source > Loki

```
URL : http://loki.monitoring.svc.cluster.local:3100
```

#### Importer les dashboards

Grafana > Dashboards > Import > ID `6417` → dashboard Kubernetes général.

Grafana > Dashboards > Import > Upload JSON → sélectionner `monitoring/grafana/dashboards/invoice-api.json` pour le dashboard custom de l'API.

#### Tester Loki

Grafana > Explore > sélectionner Loki > saisir :

```logql
{namespace="invoice"} |= ""
```

---

## Démarrage quotidien

> Ces étapes sont à faire **pour chaque démarrage** après avoir installé le projet une première fois.
> Les Helm charts (Prometheus, ArgoCD, etc.) sont persistés par Minikube — pas besoin de les réinstaller.

### 1. Démarrer Minikube

```bash
minikube start --cpus=4 --memory=6144 --driver=docker
```

### 2. Attendre que tous les pods soient Running

```bash
kubectl get pods -n invoice
kubectl get pods -n monitoring
kubectl get pods -n argocd
```

Relancer ces commandes jusqu'à voir `Running` partout. En cas de pod bloqué en `Pending` ou `CrashLoopBackOff` :

```bash
kubectl describe pod <nom-du-pod> -n <namespace>
```

### 3. Lancer les port-forwards

Les port-forwards sont des tunnels temporaires entre ton navigateur et Kubernetes. Ils s'arrêtent quand tu fermes le terminal ou redémarres — il faut les relancer à chaque démarrage.

```bash
kubectl port-forward svc/invoice-api-invoice-api 3000:3000 -n invoice &
kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring &
kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n monitoring &
kubectl port-forward svc/argocd-server 8080:443 -n argocd &
```

Le `&` lance chaque commande en arrière-plan pour garder le terminal disponible.

### 4. Vérifier que tout répond

```bash
curl http://localhost:3000/health
```

### 5. Arrêter proprement le soir

```bash
kill $(lsof -t -i:3000) $(lsof -t -i:3001) $(lsof -t -i:8080) $(lsof -t -i:9090) 2>/dev/null
minikube stop
```

---

## L'API : gestion de factures

API REST Node.js/Express avec calcul automatique de TVA.

### Routes disponibles

| Méthode | Route                    | Description             |
|---------|--------------------------|-------------------------|
| GET     | /health                  | État de l'application   |
| GET     | /metrics                 | Métriques Prometheus    |
| GET     | /tva-rates               | Liste des taux de TVA   |
| GET     | /invoices                | Lister les factures     |
| GET     | /invoices/:id            | Détail d'une facture    |
| POST    | /invoices                | Créer une facture       |
| PATCH   | /invoices/:id/status     | Changer le statut       |
| DELETE  | /invoices/:id            | Supprimer une facture   |

### Taux de TVA disponibles

| Type          | Taux  | Usage                                        |
|---------------|-------|----------------------------------------------|
| standard      | 20%   | Prestations de services, produits courants   |
| reduit        | 10%   | Restauration, travaux, transport             |
| super_reduit  | 5.5%  | Alimentation, livres, médicaments            |
| zero          | 0%    | Exports, intracommunautaire                  |

### Exemple de création de facture

```bash
curl -X POST http://localhost:3000/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "client": "Acme Corp",
    "tvaType": "standard",
    "dueDate": "2025-12-31",
    "items": [
      { "description": "Développement web", "quantity": 5, "unitPrice": 800 },
      { "description": "Hébergement mensuel", "quantity": 12, "unitPrice": 50 }
    ]
  }'
```

---

## CI/CD — GitHub Actions

Le pipeline se déclenche automatiquement à chaque **merge de Pull Request sur `main`**.

```yaml
on:
  pull_request:
    types: [closed]
    branches:
      - main
```

Étapes du pipeline :

1. Checkout du code
2. Login DockerHub
3. Génération d'un tag unique (7 premiers caractères du SHA du commit)
4. Build et push de l'image Docker (`sampaniony/invoice-api:<tag>` + `latest`)
5. Mise à jour du tag dans `helm/invoice-api/values.yaml`
6. Commit et push — ArgoCD détecte ce changement et redéploie automatiquement

---

## Structure du projet

```
invoice-api-devops/
├── src/
│   └── index.js                          # API Node.js
├── helm/
│   └── invoice-api/
│       ├── Chart.yaml                    # Métadonnées du chart
│       ├── values.yaml                   # Paramètres configurables (tag d'image, replicas…)
│       └── templates/
│           ├── deployment.yaml           # Déploiement Kubernetes
│           ├── service.yaml              # Exposition réseau
│           ├── servicemonitor.yaml       # Scraping Prometheus
│           └── _helpers.tpl             # Fonctions Helm
├── monitoring/
│   ├── grafana/
│   │   └── dashboards/
│   │       └── invoice-api.json         # Dashboard Grafana custom
│   └── loki/
│       ├── loki-values.yaml             # Config Loki
│       └── promtail-values.yaml         # Config Promtail
├── gitops/
│   └── argocd/
│       ├── invoice-api-app.yaml         # Application ArgoCD
│       └── monitoring-applicationset.yaml
├── .github/
│   └── workflows/
│       └── ci.yml                       # Pipeline CI/CD
├── Dockerfile
├── package.json
└── README.md
```

---

## Commandes utiles

```bash
# État global
kubectl get pods -n invoice
kubectl get pods -n monitoring
kubectl get pods -n argocd

# Logs de l'API en temps réel
kubectl logs -l app=invoice-api-invoice-api -n invoice -f

# Déboguer un pod
kubectl describe pod <nom-du-pod> -n <namespace>

# Désinstaller tout
helm uninstall invoice-api -n invoice
helm uninstall prometheus -n monitoring
helm uninstall loki -n monitoring
helm uninstall promtail -n monitoring
helm uninstall argocd -n argocd
```