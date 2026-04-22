# invoice-api-devops

Projet pédagogique de niveau M2 illustrant le déploiement d'une API Node.js sur Kubernetes avec une stack de supervision complète et une approche GitOps.

---

## Objectif du projet

L'objectif est de comprendre comment une application réelle est déployée, surveillée et maintenue dans un environnement professionnel moderne.

Ce projet ne se limite pas à écrire du code applicatif. Il couvre l'ensemble du cycle de vie d'une application :

- Comment empaqueter une application dans un conteneur Docker
- Comment déployer ce conteneur sur Kubernetes de façon reproductible avec Helm
- Comment surveiller l'état de l'application en temps réel avec Prometheus et Grafana
- Comment centraliser et consulter les logs applicatifs avec Loki
- Comment automatiser les déploiements sans intervention manuelle grâce à ArgoCD (GitOps)

L'API de gestion de factures est le prétexte applicatif. Ce qui est appris ici s'applique à n'importe quelle application web.

---

## Pourquoi ces outils

### Docker
Permet d'empaqueter l'application et toutes ses dépendances dans une image portable. L'image se comporte de manière identique sur n'importe quelle machine, qu'il s'agisse d'un ordinateur de développement ou d'un serveur de production.

### Kubernetes
Orchestre les conteneurs. Il s'assure que le bon nombre de copies de l'application tourne en permanence, redémarre automatiquement un conteneur qui crashe, et répartit la charge entre les instances. Minikube est la version locale de Kubernetes, utilisée ici pour apprendre sans infrastructure cloud.

### Helm
Kubernetes nécessite de nombreux fichiers de configuration YAML. Helm est un gestionnaire de paquets pour Kubernetes : il permet de regrouper ces fichiers en un chart réutilisable, paramétrable et versionné. Plutôt que de maintenir des dizaines de fichiers à la main, on installe et met à jour un chart avec une seule commande.

### Prometheus
Collecte des métriques numériques en temps réel : nombre de requêtes par seconde, temps de réponse, utilisation CPU et mémoire, nombre de factures créées. Ces métriques sont exposées par l'API sur la route /metrics et scraped automatiquement par Prometheus toutes les 15 secondes.

### Grafana
Visualise les métriques collectées par Prometheus sous forme de tableaux de bord. Grafana permet de détecter une dégradation de performance, une surcharge, ou une anomalie métier sans avoir à lire des logs bruts.

### Loki
Centralise les logs de tous les pods Kubernetes. Sans Loki, consulter les logs d'une application distribuée en plusieurs instances nécessite de se connecter manuellement sur chaque pod. Loki agrège tout au même endroit et permet de faire des recherches dans les logs directement depuis Grafana.

### ArgoCD (GitOps)
Principe fondateur du GitOps : le dépôt Git est la source de vérité unique pour l'état de l'infrastructure. ArgoCD surveille en permanence le dépôt GitHub. Dès qu'un changement est détecté dans les fichiers Helm (par exemple, un nouveau tag d'image suite à un build CI), ArgoCD synchronise automatiquement le cluster Kubernetes pour refléter cet état. Le déploiement ne passe plus par une commande manuelle mais par un simple push Git.

---

## Architecture globale

```
Développeur
    |
    | git push
    v
GitHub (invoice-api-devops)
    |
    |-- GitHub Actions (CI)
    |       - build image Docker
    |       - push sur DockerHub
    |       - met à jour le tag dans values.yaml
    |
    v
ArgoCD (GitOps)
    - détecte le changement dans le repo
    - applique le Helm chart sur Kubernetes
    |
    v
Kubernetes (Minikube)
    |
    |-- Namespace: invoice
    |       - Deployment: invoice-api (2 replicas)
    |       - Service: expose le port 3000
    |
    |-- Namespace: monitoring
            - Prometheus  (collecte les metriques)
            - Grafana     (visualisation)
            - Loki        (centralisation des logs)
            - Promtail    (agent de collecte de logs)
```

---

## L'application : API de gestion de factures

Une API REST en Node.js (Express) qui gère des factures avec calcul automatique de la TVA.

### Taux de TVA disponibles

| Type | Taux | Usage |
|---|---|---|
| standard | 20% | Prestations de services, produits courants |
| reduit | 10% | Restauration, travaux, transport |
| super_reduit | 5.5% | Alimentation, livres, medicaments |
| zero | 0% | Exports, intracommunautaire |

### Routes disponibles

| Methode | Route | Description |
|---|---|---|
| GET | /health | Etat de l'application |
| GET | /metrics | Metriques Prometheus |
| GET | /tva-rates | Liste des taux de TVA |
| GET | /invoices | Lister toutes les factures |
| GET | /invoices/:id | Consulter une facture |
| POST | /invoices | Creer une facture |
| PATCH | /invoices/:id/status | Changer le statut |
| DELETE | /invoices/:id | Supprimer une facture |

### Exemple de creation de facture

```bash
curl -X POST http://localhost:3000/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "client": "Acme Corp",
    "tvaType": "standard",
    "dueDate": "2025-12-31",
    "items": [
      { "description": "Developpement web", "quantity": 5, "unitPrice": 800 },
      { "description": "Hebergement mensuel", "quantity": 12, "unitPrice": 50 }
    ]
  }'
```

Reponse :

```json
{
  "id": "uuid-...",
  "number": "INV-0001",
  "client": "Acme Corp",
  "status": "draft",
  "subtotal": 4600.00,
  "tvaRate": 0.20,
  "tvaPercent": "20.0%",
  "tvaAmount": 920.00,
  "total": 5520.00
}
```

---

## Structure du projet

```
invoice-api-devops/
|
|-- src/
|   └── index.js                        # API Node.js
|
|-- helm/
|   └── invoice-api/
|       |-- Chart.yaml                  # Metadonnees du chart
|       |-- values.yaml                 # Parametres configurables
|       └── templates/
|           |-- deployment.yaml         # Deploiement Kubernetes
|           |-- service.yaml            # Exposition reseau
|           |-- servicemonitor.yaml     # Scraping Prometheus
|           └── _helpers.tpl            # Fonctions Helm
|
|-- monitoring/
|   |-- grafana/
|   |   └── dashboards/
|   |       └── invoice-api.json        # Dashboard custom
|   └── loki/
|       |-- loki-values.yaml            # Config Loki
|       └── promtail-values.yaml        # Config Promtail
|
|-- gitops/
|   └── argocd/
|       |-- invoice-api-app.yaml        # Application ArgoCD
|       └── monitoring-applicationset.yaml
|
|-- .github/
|   └── workflows/
|       └── ci.yml                      # Pipeline CI/CD
|
|-- Dockerfile
|-- package.json
└── README.md
```

---

## Deploiement pas a pas

### Prerequis

```bash
minikube version
kubectl version --client
helm version
docker version
```

### Demarrer Minikube

```bash
minikube start --cpus=4 --memory=6144 --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server
```

### Etape 1 - Ajouter les repos Helm

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

### Etape 2 - Creer les namespaces

```bash
kubectl create namespace invoice
kubectl create namespace monitoring
kubectl create namespace argocd
```

### Etape 3 - Installer Prometheus

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.scrapeInterval=15s \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set alertmanager.enabled=false \
  --wait
```

### Etape 4 - Installer Grafana

Grafana est inclus dans kube-prometheus-stack. Pour une instance separee :

```bash
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword='admin123' \
  --set service.type=NodePort \
  --wait
```

### Etape 5 - Acceder a Grafana

```bash
kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring &

# Recuperer le mot de passe
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode; echo
```

Ouvrir http://localhost:3001 — login : admin

### Etape 6 - Configurer Prometheus comme source de donnees

Dans Grafana : Connections > Data sources > Add data source > Prometheus

```
URL : http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Cliquer sur "Save & test".

### Etape 7 - Importer un dashboard Kubernetes

Dans Grafana : Dashboards > Import > entrer l'ID 6417 > selectionner la datasource Prometheus.

Pour le dashboard custom de l'API :
Dashboards > Import > Upload JSON > selectionner monitoring/grafana/dashboards/invoice-api.json

### Etape 8 - Installer Loki

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

### Etape 9 - Ajouter Loki comme source de donnees

Dans Grafana : Connections > Data sources > Add data source > Loki

```
URL : http://loki.monitoring.svc.cluster.local:3100
```

Tester dans Grafana > Explore :

```logql
{namespace="invoice"} |= ""
```

### Etape 10 - GitOps avec ArgoCD

```bash
helm install argocd argo/argo-cd \
  --namespace argocd \
  --set server.service.type=NodePort \
  --wait

# Mot de passe admin
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 --decode; echo

# Acceder a l'UI
kubectl port-forward svc/argocd-server 8080:443 -n argocd &
```

Ouvrir https://localhost:8080 — login : admin

Deployer l'application via GitOps :

```bash
kubectl apply -f gitops/argocd/invoice-api-app.yaml
```

### Build et deploiement de l'API

```bash
# Generer le package-lock.json (une seule fois)
npm install

# Pointer Docker vers Minikube
eval $(minikube docker-env)

# Build
docker build -t invoice-api:latest .

# Deployer
helm install invoice-app ./helm/invoice-api \
  --namespace invoice \
  --wait

# Tester
kubectl port-forward svc/invoice-app-invoice-api 3000:3000 -n invoice &
curl http://localhost:3000/health
```

---

## Commandes utiles


```bash
# 1. Démarrer Minikube
minikube start --cpus=4 --memory=6144 --driver=docker

# 2. Corriger les limites inotify (nécessaire pour Promtail)
minikube ssh "sudo sysctl fs.inotify.max_user_instances=512"
minikube ssh "sudo sysctl fs.inotify.max_user_watches=524288"

# 3. Port-forwards (à lancer en arrière-plan)
kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring &
kubectl port-forward svc/invoice-app-invoice-api 3000:3000 -n invoice &
kubectl port-forward svc/argocd-server 8080:443 -n argocd &

# 4. Vérifier que tout tourne
kubectl get pods -n invoice
kubectl get pods -n monitoring
kubectl get pods -n argocd

# Etat global
kubectl get all -n invoice
kubectl get all -n monitoring

# Logs de l'API en temps reel
kubectl logs -l app=invoice-app-invoice-api -n invoice -f

# Desinstaller tout
helm uninstall invoice-app -n invoice
helm uninstall prometheus -n monitoring
helm uninstall loki -n monitoring
helm uninstall promtail -n monitoring
helm uninstall argocd -n argocd

# Arreter Minikube
minikube stop
```

---

## Ce que ce projet apprend

A l'issue de ce projet, les notions suivantes sont maitrisees en pratique :

- Conteneurisation d'une application Node.js avec Docker
- Deploiement sur Kubernetes avec gestion des ressources, health checks et replicas
- Packaging d'une application Kubernetes avec Helm
- Observabilite : metriques avec Prometheus, visualisation avec Grafana, logs avec Loki
- GitOps : synchronisation automatique entre un depot Git et un cluster Kubernetes via ArgoCD
- Pipeline CI/CD avec GitHub Actions : build, push et mise a jour automatique du tag d'image