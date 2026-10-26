"""Send today's batch of professor emails through Gmail, a few minutes apart.

Signs in with a Google login window (ASU accounts can't use app passwords) and
only asks for permission to send mail. Your name and address come from profile.json.

    PY=.venv/bin/python
    $PY send_batch.py --dry-run   # list who would be emailed today; sends nothing
    $PY send_batch.py --test      # send one sample to yourself, marked [TEST]
    $PY send_batch.py --login     # log in to Google again
    $PY send_batch.py             # send today's batch

Professors already in data/sent_log.json are never emailed twice.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import subprocess
import sys
import time
import warnings
from datetime import date, datetime
from email.message import EmailMessage
from pathlib import Path

warnings.filterwarnings("ignore")

HERE = Path(__file__).parent
DATA = HERE / "data"
LOG = DATA / "sent_log.json"
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
PROFILE = json.loads((HERE / "profile.json").read_text()) if (HERE / "profile.json").exists() else {}
SENDER_NAME = PROFILE.get("name", "")
SENDER_EMAIL = PROFILE.get("email", "")
GAP_MINUTES = (3, 6)


def load_env() -> None:
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def notify(title: str, text: str) -> None:
    """Mac notification, so scheduled runs can tell you how they went."""
    script = f"display notification {json.dumps(text)} with title {json.dumps(title)}"
    subprocess.run(["osascript", "-e", script], check=False)


def credentials(interactive: bool):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    token = HERE / "gmail_token.json"
    creds = Credentials.from_authorized_user_file(str(token), SCOPES) if token.exists() else None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            notify("Mailer needs you", "Google login expired. Run send_batch.py --login.")
            sys.exit("Google login expired. Run with --test once to log in again.")
        secrets = os.path.expanduser(os.environ.get("GOOGLE_CREDENTIALS_FILE", str(HERE / "credentials.json")))
        flow = InstalledAppFlow.from_client_secrets_file(secrets, SCOPES)
        print(f"A browser window will open: sign in as {SENDER_EMAIL} and click Allow.")
        creds = flow.run_local_server(port=0, login_hint=SENDER_EMAIL)
        token.write_text(creds.to_json())
        token.chmod(0o600)
    return creds


def message(to: str, template: dict, test_note: str = "") -> dict:
    msg = EmailMessage()
    msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
    msg["To"] = to
    msg["Subject"] = ("[TEST] " if test_note else "") + template["subject"]
    msg.set_content("Please view this email in an HTML-capable mail client.")
    msg.add_alternative(test_note + template["body"], subtype="html")
    cv = HERE / template["cv"]
    msg.add_attachment(cv.read_bytes(), maintype="application", subtype="pdf", filename=cv.name)
    return {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--background", action="store_true", help="never open a login window")
    parser.add_argument("--login", action="store_true", help="log in to Google again (deletes the saved login first)")
    args = parser.parse_args()
    load_env()
    if not SENDER_EMAIL:
        sys.exit("profile.json is missing or has no email: copy profile.example.json to profile.json and fill it in.")
    limit = int(os.environ.get("DAILY_LIMIT", "30"))

    templates = json.loads((DATA / "email_templates.json").read_text())
    faculty = [f for f in json.loads((DATA / "faculty.json").read_text()) if f["email"] in templates]
    before = set(json.loads((DATA / "contacted_before.json").read_text())) if (DATA / "contacted_before.json").exists() else set()
    log = json.loads(LOG.read_text()) if LOG.exists() else {}

    today = date.today().isoformat()
    sent_today = sum(1 for s in log.values() if datetime.fromisoformat(s["sentAt"].replace("Z", "+00:00")).astimezone().date().isoformat() == today)
    # Professors who recently got a similar email from another student go last.
    waiting = sorted((f for f in faculty if f["email"] not in log), key=lambda f: f["email"] in before)
    batch = waiting[: max(0, limit - sent_today)]
    print(f"{len(log)} sent so far, {len(waiting)} waiting, {sent_today} sent today (limit {limit}).")

    if args.login:
        (HERE / "gmail_token.json").unlink(missing_ok=True)
        credentials(interactive=True)
        print(f"Logged in as {SENDER_EMAIL}.")
        return 0

    if args.dry_run:
        for n, f in enumerate(batch, 1):
            t = templates[f["email"]]
            print(f"  {n}. {f['name']} <{f['email']}>  [{Path(t['cv']).name}]  {t['subject']}")
        print("\nDry run: nothing sent.")
        return 0

    from googleapiclient.discovery import build
    gmail = build("gmail", "v1", credentials=credentials(not args.background), cache_discovery=False)
    send = lambda body: gmail.users().messages().send(userId="me", body=body).execute(num_retries=3)

    if args.test:
        sample = (batch or waiting or faculty)[0]
        note = (f'<p style="background:#fff3cd;padding:8px">TEST: this is the email {sample["name"]} '
                f'({sample["email"]}) would get. Nobody else was contacted.</p>')
        send(message(SENDER_EMAIL, templates[sample["email"]], note))
        print(f"Sent a test copy of {sample['name']}'s email to {SENDER_EMAIL}.")
        return 0

    if not batch:
        print("Today's limit is reached. Run again tomorrow." if waiting else "Everyone has been emailed.")
        return 0
    for n, prof in enumerate(batch, 1):
        try:
            send(message(prof["email"], templates[prof["email"]]))
        except Exception as e:  # sending limit hit, account flagged, etc.: stop rather than keep going
            print(f"Stopped: couldn't send to {prof['email']}: {e}")
            notify("Mailer stopped", f"Couldn't send to {prof['name']} after {n - 1} emails today. See send_log.txt.")
            return 1
        log[prof["email"]] = {"sentAt": datetime.utcnow().isoformat() + "Z", "subject": templates[prof["email"]]["subject"]}
        LOG.write_text(json.dumps(log, indent=2))
        print(f"{datetime.now():%H:%M}  {n}/{len(batch)}  sent to {prof['name']} <{prof['email']}>", flush=True)
        if n < len(batch):
            time.sleep(random.uniform(*GAP_MINUTES) * 60)
    print(f"\nDone for today: {len(batch)} sent, {len(waiting) - len(batch)} still waiting.")
    notify("Mailer", f"Sent {len(batch)} professor emails today. {len(waiting) - len(batch)} still to go.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
