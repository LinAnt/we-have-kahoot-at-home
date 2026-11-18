# Quiz at home

A self-hosted live quiz with separate host, player, and projector interfaces. Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open http://localhost:3000. Other devices on your network use `http://YOUR_SERVER_IP:3000`.

- `/host`: create a room, optionally upload YAML, start questions, reveal answers, and advance rounds. Host access is stored in that browser tab; keep it open or reload it in the same tab.
- `/play`: join with a room code and nickname. Player access survives reloads in the same browser.
- `/screen`: enter a room code for a read-only large-screen view. The host also has a direct display link.

No cloud services or accounts are required. Typography optionally loads from Google Fonts, with local font fallbacks when offline. Allow TCP port 3000 through your firewall for other devices. `PORT`, `HOST`, and `QUESTIONS_FILE` configure the server.

## Docker

Set `PUBLIC_URL` to the address players use to reach the server, for example:

```sh
PUBLIC_URL=https://quiz.example.com npm start
```

When set, the big-screen lobby displays a QR code linking directly to `/play?code=ROOM_CODE`. Scanning it fills in the room code; players enter their nickname to join. The code disappears when the game starts. QR images are generated locally without an external service. Use an HTTP or HTTPS URL reachable from players' phones. The join link uses `/play` at that URL's origin, matching the app's routes. When unset, no QR code is displayed.

For Docker Compose, set `PUBLIC_URL` in your shell or a `.env` file next to `compose.yaml`.

```sh
docker compose up --build -d
```

The supplied question file and `assets` folder are mounted read-only. Changes to questions apply to newly created rooms.

## Themes

Hosts can select Default or Christmas when creating a room, and change the theme in the lobby before starting. The selection is shared live with all players and the big screen, including after reconnecting. Default preserves the original appearance; Christmas adds an evergreen background, festive colors, and a subtle snow pattern.

## Questions

The default file is `questions.yaml`. A host may instead upload a YAML file when creating a room.

```yaml
- title: "3 tablespoons and one gabelspoon plz"
  type: text
  text: "How large is the biggest recorded DDos attack?"
  image: assets/network.png # Optional; place the file in the assets folder
  options:
    A: "~18 gbps"
    B: "~140 tbps"
    C: "~31 tbps"
    D: "~180 gbps"
  answer: C
  duration: 30

- title: Back to basics
  type: text
  text: What year did Linux development start?
  answer: "1991"
```

Presence of `options` selects multiple choice, regardless of `type`. Supported types are `text`, `multi-answer`, and `multiple-choice`; all choice questions accept one option. Option keys are normalized to uppercase. Free-text answers ignore case, surrounding whitespace, and repeated whitespace. `duration` is optional, defaults to 30 seconds, and accepts 5–300 seconds.

Each question may include an optional `image` path, such as `assets/network.png` (or `/assets/network.png`). Store image files in the project's `assets` folder; subfolders are supported. PNG, JPEG, GIF, WebP, AVIF, and SVG images are supported. Images appear below the question for hosts, players, and the big screen, including during answer reveal. Omit `image` for questions without a picture. Uploaded YAML uses the same server-side assets folder; uploading YAML does not upload images.

Each player answers once per question. Correct answers earn 500–1,000 points depending on response time. Rounds reveal when everyone answers, the timer expires, or the host clicks Reveal. Scores and correct answers stay hidden until reveal. The host advances rounds manually, allowing time to discuss results and standings.

Rooms and scores live in memory and are lost when the server restarts. Players join during the lobby; reconnecting players retain their seat. This version runs as a single server process, supporting up to 100 rooms and 200 players per room. Host tokens are private: do not share browser session storage. For internet hosting, place the service behind an HTTPS reverse proxy with buffering disabled for `/events` (server-sent events). Room creation is open, so restrict access at your proxy if hosting for a private group.

## Tests

```sh
npm test
```
