HAENGT-GRUND: rechte

Verweigerter Befehl (wörtlich): `rsvg-convert -w 256 /home/anhi/GitHub/nixblick/plan4ju/assets/entwuerfe/a-haus.svg -o /home/anhi/GitHub/nixblick/plan4ju/.arbeit/a.png`
Ebenso `convert -background none -density 96 …/a-haus.svg -resize 256x256 …/a.png` („requires approval“).

Stand: Drei Entwürfe als SVG liegen lokal in `assets/entwuerfe/` (a-haus: Haus mit Haken, terrakotta; b-vier-felder: vier Felder für Aufgaben/Termine/Mahlzeiten/Einkäufe, petrol; c-p-teller: P mit Teller, bernstein). Ohne Rasterisierung kann ich weder die PNGs (icon-512, icon-192, apple-touch-icon 180) erzeugen noch die Entwürfe ansehen oder prüfen (Lesbarkeit bei 32 px, Maskable-Rand). Nichts committet.

Was fehlt: Freigabe für `rsvg-convert` (oder `convert`) für den Ordner des Repos. Dann: Entwürfe rendern, ansehen, einen wählen (Tendenz: A, weil bei 32 px am klarsten und Haus = Familie), `assets/logo.svg` und die drei PNGs bauen, committen, Ticket schließen.
