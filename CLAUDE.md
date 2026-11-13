# Plan4JU – Regeln für Agenten

**Dieses Repo ist ÖFFENTLICH.** Hier landet nur, was jeder lesen darf.

Nie ins Repo (auch nicht in Commits, Tickets, Tests, Seeds, Screenshots):
- Servernamen, IPs, Hoster, Ports, SSH-/Ansible-Details, interne Pfade (`/home/...`), Ticket-Verweise auf private Repos
- echte Namen, Termine, Adressen, Fotos oder sonstige Daten der Familie; Testdaten sind erfunden („Familie Muster“)
- Geheimnisse jeder Art → Vault `~/.secrets/plan4ju/`, im Repo nur `.env.example` mit Platzhaltern

Betrieb und Ausrollen (Server, Domain, Proxy, Sicherung) liegen im privaten Betriebs-Repo, nicht hier.
Im Repo nur generisch: `Dockerfile`, `docker-compose.yml`, Doku „Reverse Proxy mit HTTPS davor“.

Vor jedem Push: `git diff --cached` auf obige Punkte prüfen, `gitleaks detect` wenn vorhanden.

Auftrag: `docs/masterprompt.md`, zunächst nur Release 0.1, danach auf Freigabe warten.
