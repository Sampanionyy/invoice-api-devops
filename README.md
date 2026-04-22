# 🧾 invoice-api-devops

API de gestion de factures en Node.js avec monitoring complet (Prometheus, Grafana, Loki) déployé sur Kubernetes via Helm et GitOps ArgoCD.

---

## 📁 Structure du projet

```
invoice-api-devops/
├── src/
│   └── index.js                  # API Node.js (Express + prom-client)
├── helm/
│   └── invoice-api/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── deployment.yaml
│           ├── service.yaml
│           ├── servicemonitor.yaml
│           └── _helpers.tpl
├── monitoring/
│   ├── grafana/
│   │   └── dashboards/
│   │       └── invoice-api.json  # Dashboard Grafana prêt à importer
│   └── loki/
│       ├── loki-values.yaml
│       └── promtail-values.yaml
├── gitops/
│   └── argocd/
│       ├── invoice-api-app.yaml
│       └── monitoring-applicationset.yaml
├── .github/
│   └── workflows/
│       └── ci.yml
├── Dockerfile
├── package.json
└── README.md
```

---

## 🚀 Prérequis

```bash
# Vérifier que tout est installé
minikube version
kubectl version --client
helm version
docker version
```

---

## 🔧 Initialisation du projet

```bash
# Cloner le repo
git clone https://github.com/Sampanionyy/invoice-api-devops.git
cd invoice-api-devops

# Démarrer Minikube (4 CPU, 6Go RAM recommandé pour la stack monitoring)
minikube start --cpus=4 --memory=6144 --driver=docker

# Activer les addons nécessaires
minikube addons enable ingress
minikube addons enable metrics-server
```

---

## 📦 ÉTAPE 1 — Ajouter les repos Helm

```bash
# Prometheus & Grafana (kube-prometheus-stack)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# Grafana (Loki)
helm repo add grafana https://grafana.github.io/helm-charts

# ArgoCD
helm repo add argo https://argoproj.github.io/argo-helm

# Mettre à jour tous les repos
helm repo update

# Vérifier les repos ajoutés
helm repo list
```

---

## 🗂️ ÉTAPE 2 — Créer les namespaces

```bash
# Namespace pour l'application
kubectl create namespace invoice

# Namespace pour le monitoring
kubectl create namespace monitoring

# Namespace pour ArgoCD
kubectl create namespace argocd

# Vérifier
kubectl get namespaces
```

---

## 📊 ÉTAPE 3 — Installer Prometheus par Helm

```bash
# Installer kube-prometheus-stack (Prometheus + Alertmanager + node-exporter)
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.scrapeInterval=15s \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set alertmanager.enabled=false \
  --wait

# Vérifier que les pods démarrent (attendre ~2 min)
kubectl get pods -n monitoring

# Vérifier les services
kubectl get svc -n monitoring
```

---

## 📈 ÉTAPE 4 — Installer Grafana par Helm

> Grafana est déjà inclus dans kube-prometheus-stack (étape 3).
> Si tu veux une instance Grafana séparée :

```bash
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword='admin123' \
  --set service.type=NodePort \
  --wait

# Vérifier
kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana
```

---

## 🌐 ÉTAPE 5 — Accéder à Grafana

```bash
# Méthode 1 : port-forward (recommandé pour Minikube)
kubectl port-forward svc/prometheus-grafana 3001:80 -n monitoring &

# Ouvrir dans le navigateur :
# http://localhost:3001
# Login : admin
# Password :
kubectl get secret -n monitoring prometheus-grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo

# Méthode 2 : via Minikube service
minikube service prometheus-grafana -n monitoring
```

---

## 🔗 ÉTAPE 6 — Configurer la source de données Prometheus

Dans Grafana → **Configuration > Data Sources > Add data source** :

```
Type     : Prometheus
URL      : http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
Access   : Server (default)
```

Ou via CLI (API Grafana) :

```bash
curl -X POST http://admin:admin123@localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prometheus",
    "type": "prometheus",
    "url": "http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090",
    "access": "proxy",
    "isDefault": true
  }'
```

---

## 📋 ÉTAPE 7 — Importer un dashboard Kubernetes

### Dashboard Kubernetes officiel (ID: 6417)

Dans Grafana → **Dashboards > Import** :
- Entrer l'ID : `6417` → Load
- Sélectionner la datasource Prometheus → Import

### Dashboard Invoice API (custom)

```bash
# Le fichier est dans : monitoring/grafana/dashboards/invoice-api.json
# Grafana → Dashboards > Import > Upload JSON file
# Sélectionner : monitoring/grafana/dashboards/invoice-api.json
```

Autres dashboards utiles :
- `1860` — Node Exporter Full
- `7249` — Kubernetes Cluster Overview
- `15760` — Kubernetes pod logs

---

## 📝 ÉTAPE 8 — Installer Loki

```bash
# Installer Loki (mode single binary pour Minikube)
helm install loki grafana/loki \
  --namespace monitoring \
  --values monitoring/loki/loki-values.yaml \
  --wait

# Installer Promtail (agent qui collecte les logs des pods)
helm install promtail grafana/promtail \
  --namespace monitoring \
  --values monitoring/loki/promtail-values.yaml \
  --wait

# Vérifier
kubectl get pods -n monitoring | grep -E 'loki|promtail'
```

---

## 🔗 ÉTAPE 9 — Ajouter Loki comme source de données

Dans Grafana → **Configuration > Data Sources > Add data source** :

```
Type  : Loki
URL   : http://loki.monitoring.svc.cluster.local:3100
```

Ou via API :

```bash
curl -X POST http://admin:admin123@localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Loki",
    "type": "loki",
    "url": "http://loki.monitoring.svc.cluster.local:3100",
    "access": "proxy"
  }'
```

**Tester dans Grafana → Explore :**
```logql
{namespace="invoice"} |= ""
```

---

## 🔄 ÉTAPE 10 — GitOps avec ArgoCD

### Installer ArgoCD

```bash
helm install argocd argo/argo-cd \
  --namespace argocd \
  --set server.service.type=NodePort \
  --wait

# Récupérer le mot de passe admin
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 --decode; echo

# Accéder à l'UI ArgoCD
kubectl port-forward svc/argocd-server 8080:443 -n argocd &
# https://localhost:8080  (accepter le certificat self-signed)
# Login: admin / <password ci-dessus>
```

### Déployer l'API via GitOps

```bash
# Appliquer l'Application ArgoCD pour l'invoice-api
kubectl apply -f gitops/argocd/invoice-api-app.yaml

# Appliquer l'ApplicationSet pour le monitoring
kubectl apply -f gitops/argocd/monitoring-applicationset.yaml

# Vérifier les applications ArgoCD
kubectl get applications -n argocd

# Synchroniser manuellement si besoin
kubectl patch application invoice-api -n argocd \
  --type merge -p '{"operation":{"sync":{}}}'
```

---

## 🐳 Build & déploiement manuel de l'API

```bash
# Pointer Docker vers le daemon Minikube
eval $(minikube docker-env)

# Build de l'image
docker build -t invoice-api:latest .

# Déployer via Helm
helm install invoice-app ./helm/invoice-api \
  --namespace invoice \
  --wait

# Vérifier
kubectl get pods -n invoice
kubectl get svc -n invoice

# Port-forward pour tester l'API
kubectl port-forward svc/invoice-app-invoice-api 3000:3000 -n invoice &
```

---

## 🧪 Tester l'API

```bash
# Health check
curl http://localhost:3000/health

# Voir les taux de TVA disponibles
curl http://localhost:3000/tva-rates

# Créer une facture (TVA standard 20%)
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

# Créer une facture (TVA réduite 10%)
curl -X POST http://localhost:3000/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "client": "Restaurant Le Gourmet",
    "tvaType": "reduit",
    "items": [
      { "description": "Logiciel caisse", "quantity": 1, "unitPrice": 1200 }
    ]
  }'

# Lister toutes les factures
curl http://localhost:3000/invoices

# Changer le statut d'une facture
curl -X PATCH http://localhost:3000/invoices/<ID>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "paid"}'

# Voir les métriques Prometheus
curl http://localhost:3000/metrics
```

---

## 💰 Taux de TVA disponibles

| Type | Taux | Cas d'usage |
|------|------|-------------|
| `standard` | 20% | Prestations de services, produits standard |
| `reduit` | 10% | Restauration, travaux, transport |
| `super_reduit` | 5.5% | Alimentation, livres, médicaments |
| `zero` | 0% | Exports, intracommunautaire |

---

## 🔁 Workflow GitOps complet

```
Code push → GitHub Actions → Build Docker image
     → Push DockerHub → Update values.yaml (image tag)
          → Push to main → ArgoCD détecte le changement
               → Sync automatique sur Kubernetes
                    → Nouveau pod déployé 🚀
```

---

## 🛠️ Commandes utiles

```bash
# Status global
kubectl get all -n invoice
kubectl get all -n monitoring

# Logs de l'API
kubectl logs -l app=invoice-app-invoice-api -n invoice -f

# Désinstaller tout
helm uninstall invoice-app -n invoice
helm uninstall prometheus -n monitoring
helm uninstall grafana -n monitoring
helm uninstall loki -n monitoring
helm uninstall promtail -n monitoring
helm uninstall argocd -n argocd

# Arrêter Minikube
minikube stop
```
