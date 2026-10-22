# Owncast

[Owncast](https://owncast.online) ist ein selbst gehosteter
Live-Streaming-Server: dein eigenes Twitch, mit Chat. Diese Integration bringt
dein Owncast in Gladys: ob du live bist, wie viele Leute zuschauen, den Titel
des Streams und Szenen, die reagieren, wenn ein Stream startet, endet oder eine
Zuschauerzahl erreicht. Szenen können auch in den Chat schreiben.

Owncast kann bei dir zu Hause oder auf einem gemieteten Server laufen: Die
Integration funktioniert mit beidem (das Abzeichen des Geräts zeigt je nach
Adresse „lokal“ oder „Cloud“).

Getestet mit einem echten Owncast in Docker (Version 0.3.0, Oktober 2026) und
einem von ffmpeg gesendeten Testbild: Live-Start, Zuschauer, Ende des Streams,
Admin-Status, eine Chatnachricht. Rückmeldungen sind in
[den Issues](https://github.com/guim31/gladys-owncast/issues) willkommen.

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen Owncast-Server, den Gladys erreicht (standardmäßig Port 8080, oder
  seine https://-Adresse).
- Optional: das Passwort der Owncast-Verwaltung, für eingehende Bitrate und
  Auflösung sowie die Zuschauer, wenn Owncast sie verbirgt.
- Optional: ein Owncast-Zugriffstoken, um aus einer Szene in den Chat zu
  schreiben.

## Erste Schritte

### 1. Die Adresse von Owncast finden

Es ist die Adresse der Seite, die deine Zuschauer öffnen, zum Beispiel
`http://192.168.1.2:8080` oder `https://live.example.org`. Eine aus dem Browser
kopierte Adresse geht auch (`…/admin`): Die Integration behält ihren Anfang.

### 2. Die Integration konfigurieren

Öffne die Integration in Gladys und fülle aus:

- **Owncast-Adresse**.
- **Admin-Passwort (optional)**: das, mit dem du `/admin` öffnest (Benutzer
  `admin`). Es ergänzt das Gerät um zwei Funktionen: eingehende Bitrate und
  eingehende Auflösung.
- **Zugriffstoken (optional)**: Öffne in Owncast Admin → Integrations → Access
  Tokens, erstelle ein Token mit dem Recht, Systemnachrichten zu senden, und
  füge es hier ein. Nur für die Aktion „Nachricht in den Chat senden“.
- **Aktualisierungsintervall**: standardmäßig 30 Sekunden. Jedes Mal eine
  leichte Anfrage (zwei mit dem Admin-Passwort).
- **Sprache der Namen**: die Sprache der Funktionsnamen und der
  Szenen-Ergebnisse.

Nutze dann **Verbindung testen**: Damit wird Owncast gelesen, und du siehst, ob du live bist.

### 3. Das Gerät anlegen

Öffne den Tab **Entdecken** und lege das Gerät an, das den Namen deines Servers
trägt. Gibst du das Admin-Passwort später ein, bietet der Tab an, das Gerät um
die zwei neuen Funktionen zu aktualisieren.

## Das Gerät

| Funktion             | Was sie anzeigt                                              |
| -------------------- | ------------------------------------------------------------ |
| Live                 | Ja, solange du live bist                                     |
| Zuschauer            | Wer gerade zuschaut (0 offline)                              |
| Zuschauerspitze      | Die meisten Zuschauer des laufenden oder letzten Streams     |
| Titel des Streams    | Der in Owncast eingestellte Titel                            |
| Dauer des Streams    | Minuten seit dem Start des Streams (0 offline)               |
| Eingehende Bitrate   | Mit Admin-Passwort: Video-Bitrate deiner Software            |
| Eingehende Auflösung | Mit Admin-Passwort: die gesendete Auflösung, z. B. 1920×1080 |

Ein Stream endet, wenn Owncast seit einer Minute offline ist: Verbindet sich
deine Streaming-Software nach einem kurzen Netzausfall neu, geht der Stream weiter. Eine spätere Neuverbindung, auch zwischen zwei Abfragen, beendet den Stream und startet einen neuen.

## Dashboard

Das Widget **Owncast-Stream** zeigt den Titel, dann live oder offline. Live:
die Zuschauer, die Spitze und die Minuten, dazu mit Admin-Passwort die
eingehende Auflösung und Bitrate. Offline: Dauer und Spitze des letzten
Streams. Die Schaltfläche **Aktualisieren** liest Owncast sofort; **Ansehen**
öffnet die Seite des Streams, wenn seine Adresse mit https:// beginnt.

## Szenen

### Auslöser

- **Ein Stream startet**: mit dem Titel des Streams und dem Namen des Servers.
- **Ein Stream endet**: mit dem Titel, der Dauer in Minuten und der
  Zuschauerspitze.
- **Zuschauer erreichen eine Schwelle**: wähle 1, 5, 10, 25, 50, 100, 250, 500
  oder 1000; löst einmal pro Stream aus, wenn die Zuschauer sie erreichen. 1
  heißt „jemand schaut zu“.

Start, Ende und Schwellen merkt sich die Integration: Ein Neustart von Gladys
während eines Streams meldet ihn nicht noch einmal, und ein Stream, der endete,
während Gladys gestoppt war, wird trotzdem gemeldet, einmal.

### Aktionen

- **Zustand des Streams**: liest den Stream für die nächsten Aktionen: live
  oder nicht, Titel, Zuschauer, Spitze, Dauer in Minuten und einen fertigen
  Satz („Mein Stream: Live, „Samstagsbastelei“, 12 Zuschauer, seit 45 Min.“).
- **Nachricht in den Chat senden**: postet eine Systemnachricht im Chat des
  Streams. Braucht das Zugriffstoken aus der Konfiguration.

### Szenen-Ideen

- **On-Air-Lampe**: „Ein Stream startet“ schaltet die Lampe an der Bürotür auf
  Rot; „Ein Stream endet“ schaltet sie aus.
- **Nicht stören**: „Ein Stream startet“ schaltet den Türgong stumm; klingelt
  trotzdem jemand, sagt „Nachricht in den Chat senden“ den Zuschauern, dass du
  in 2 Minuten zurück bist.
- **Publikum**: „Zuschauer erreichen eine Schwelle“ (50) schickt dir eine
  Benachrichtigung mit dem Titel; „Ein Stream endet“ schickt Dauer und Spitze.

## Fehlerbehebung

- **Owncast antwortet nicht**: Prüfe Adresse und Port von dem Rechner aus, auf
  dem Gladys läuft.
- **Kein Owncast unter dieser Adresse**: Die Adresse führt zu einem anderen
  Dienst oder zu einem Unterpfad, der kein Owncast ist.
- **Die Adresse leitet um**: Gib die https://-Adresse ein.
- **Admin-Passwort von Owncast abgelehnt**: Gib das Passwort von `/admin` ein;
  der Live-Zustand wird inzwischen weiter gelesen.
- **Zugriffstoken abgelehnt**: Erstelle das Token neu, mit dem Recht,
  Systemnachrichten zu senden.
- **Die Zuschauer bleiben während des Streams bei 0**: Owncast verbirgt
  vielleicht die Zuschauerzahl (Admin → Configuration); gib das Admin-Passwort
  ein, um sie trotzdem zu lesen.

## Grenzen

- Ein Owncast-Server pro Integration.
- Dauer und Spitze misst die Integration; eine Spitze zwischen zwei Abfragen
  sieht nur der Admin-Status.
- Gedacht für Owncast 0.1 und neuer; getestet mit 0.3.0.
- Solange Owncast nicht antwortet, behält das Gerät seinen letzten Zustand; ein inzwischen abgebrochener Stream endet bei der letzten Abfrage, die ihn sah.
- Verbirgt Owncast die Zuschauer und ist kein Admin-Passwort gesetzt, stehen Zuschauer und Spitze in den Szenen auf 0.
- Nicht mit dem Owncast-Projekt verbunden.
