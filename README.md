# ASU Professor Mailer

Ask ASU professors about **grader, TA, IA and research assistant (RA)** openings with
personal, one-to-one emails sent from your own `@asu.edu` Gmail account. The emails
go out in small daily batches, each with the right version of your CV attached.

Every email is built for one professor:

- **Research faculty** get a line about *their* research ("Your work on robot perception
  caught my attention…"), followed by the part of *your* background that fits that area,
  and your research CV.
- **Teaching faculty** (lecturers, instructors) are asked about grading and TA work for
  their courses, with your teaching CV.
- **Chosen departments** (Information Systems by default) get your data CV.
- Subject lines and openings change slightly from one professor to the next, so two
  people in the same lab don't get identical text.

It sends about 30 emails a day (Monday to Thursday if you schedule it), spaced 3–6 minutes
apart, and **never emails the same professor twice**.

> **Why Google sign-in?** ASU Google accounts don't allow app passwords, so normal
> SMTP scripts don't work. This tool signs in through Google OAuth and asks only for
> permission to *send* mail. It can't read your inbox.

---

## What you need

- macOS, Linux or Windows with **Python 3.9+** and **Node.js 18+** (Node has no packages to install)
- Your ASU Google account (`asurite@asu.edu`)
- Your CV as a PDF (one file works; three versions work better)
- About 30 minutes for setup

## Setup

### 1. Get the code

```bash
git clone https://github.com/namand6/asu-professor-mailer.git
cd asu-professor-mailer
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt      # Windows: .venv\Scripts\pip install -r requirements.txt
```

### 2. Make your own Google sign-in key (one time, about 10 minutes)

1. Open <https://console.cloud.google.com/> and create a project (for example "Prof Mailer").
2. **APIs & Services → Library** → search for **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → choose **External**, fill in the app name
   and your email, then add your `@asu.edu` address under **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   Application type **Desktop app** → **Download JSON**.
5. Save that file in this folder as **`credentials.json`**.

Never share `credentials.json` or `gmail_token.json`. Both are gitignored.

### 3. Fill in your profile

```bash
cp profile.example.json profile.json
```

Edit `profile.json` (it's gitignored, so it stays on your computer):

| Field | What it's for |
|---|---|
| `name`, `email`, `linkedin`, `portfolio` | Sender details and the signature. Leave `linkedin` or `portfolio` as `""` to hide them. |
| `program`, `short_title`, `university`, `university_short`, `gpa` | The opening line: "I'm Alex, an MS Computer Science student at ASU (GPA 3.8/4)…". Set `gpa` to `""` to leave it out. |
| `when`, `term_label` | When you're available. Used in the body and the subject lines. |
| `cv` | Paths to your CV PDFs. Using one CV? Point all three at the same file. |
| `data_cv_departments` | Departments that get the `data` CV. |
| `extras` | An optional extra sentence. Set it to `""` to drop it. |
| `background` | **The most important part.** One or two sentences per research area on what you've done that fits it. Use real projects and numbers. Any area you leave out uses `default`. |

Put your CV PDFs in `cv/`.

### 4. Get the list of professors

```bash
node scrape_faculty.js      # writes data/faculty.json from ASU's public directory
```

By default it collects SCAI, Information Systems, Data Science and Polytechnic IT. To
change the departments, edit `DEPARTMENTS` at the top of `scrape_faculty.js`. The ID
is the department number in the ASU directory URL.

### 5. Choose who to email and what to say about their research

```bash
cp data/topics.example.json data/topics.json
```

Add one line per professor to `data/topics.json`:

```json
{
  "yz.yang@asu.edu": "robot perception and vision-and-language models",
  "lecturer@asu.edu": "",
  "not.relevant@asu.edu": "skip"
}
```

- A **short phrase** about their research goes into "Your work on ___ caught my attention".
  Write it from their faculty page or recent papers. This is what makes the email personal.
- **`""`** (empty): the email talks about their courses instead. Good for teaching faculty.
- **`"skip"`**: don't email them.
- **Professors not in the file are skipped**, so only the people you choose get an email.

Tip: `data/faculty.json` holds each professor's research text from the directory. You
(or an AI assistant) can read it and draft `topics.json` quickly. Check the result by hand.

### 6. Build the emails and check them

```bash
node generate_templates.js                  # writes data/email_templates.json
.venv/bin/python send_batch.py --dry-run    # who gets emailed today. Sends nothing.
.venv/bin/python send_batch.py --test       # sends ONE sample to yourself, marked [TEST]
```

The first `--test` opens a browser: sign in with your ASU account and click **Allow**.
Read the test email carefully: the name, CV attachment, links and wording.

### 7. Send

```bash
.venv/bin/python send_batch.py              # sends today's batch (DAILY_LIMIT, default 30)
```

Run it once a day, or let your Mac do it for you:

```bash
./scripts/schedule_mac.sh       # sends automatically Mon–Thu at 9:30 am
./scripts/schedule_mac.sh off   # turns it off
```

If the Mac is asleep at 9:30, the batch starts when it wakes. Results go to
`send_log.txt`, and you get a Mac notification. On Windows or Linux, use Task Scheduler
or cron to run `send_batch.py --background`.

## Commands

| Command | What it does |
|---|---|
| `node scrape_faculty.js` | Downloads the professor list into `data/faculty.json` |
| `node generate_templates.js` | Builds every email into `data/email_templates.json`. Run it again after any change to `profile.json` or `topics.json`. |
| `send_batch.py --dry-run` | Shows today's batch without sending |
| `send_batch.py --test` | Sends one sample email to yourself |
| `send_batch.py --login` | Signs in to Google again |
| `send_batch.py` | Sends today's batch |
| `send_batch.py --background` | The same, but never opens a login window (used by the scheduler) |

Settings (optional), in a `.env` file or your environment:

```
DAILY_LIMIT=30                              # emails per day
GOOGLE_CREDENTIALS_FILE=./credentials.json  # where your Google key is
```

## Making it yours

- **Wording**: everything is in `build()` in `generate_templates.js`: the subjects, the
  opening line, the interest line and the closing. Edit it, run the generator again,
  then send yourself a `--test`.
- **Research areas**: `TOPIC_AREAS` in `generate_templates.js` matches a professor's
  topic to one of your `background` paragraphs (for example "database" → `databases`).
  To add an area, add a regex line there and a matching key in `profile.json`.
- **Another university**: `scrape_faculty.js` is written for ASU's directory API. Point it at
  a different source, or write `data/faculty.json` yourself as a list of
  `{ "name", "email", "title", "department", "categoryKey" }` entries. Everything else
  works the same.
- **Spacing and limits**: change `GAP_MINUTES` in `send_batch.py` and `DAILY_LIMIT`.
- **Professors to email last**: list their emails in `data/contacted_before.json`, for example
  people a classmate has just emailed.

## Please use it responsibly

- **Keep it small and personal.** About 30 a day is a safe limit for a new sender. Sending
  hundreds at once can get your ASU account flagged, and it annoys faculty.
- **Write real topics.** A generic mass email is easy to spot. The research line is what
  gets replies.
- **Coordinate with friends.** If several students email the same professors in the same
  week, everyone looks like spam. Split up departments, or wait a couple of weeks.
- **Never email anyone twice** (the tool makes sure of this), and stop if someone asks.
- Follow ASU's acceptable use policy for your account.

## Files

```
generate_templates.js   builds the emails from your profile + topics
send_batch.py           sends today's batch through the Gmail API
scrape_faculty.js       downloads faculty from ASU's public directory
scripts/schedule_mac.sh daily schedule on macOS (launchd)
profile.example.json    copy to profile.json (your details)
data/topics.example.json copy to data/topics.json (who to email + their topics)
cv/                     your CV PDFs (gitignored)
```

Files you create (`profile.json`, `credentials.json`, `gmail_token.json`, `data/*.json`,
CV PDFs and logs) are all gitignored, so you can fork this, `git pull` updates, and never
commit anything personal.

## License

MIT. Fork it and change anything you like.
