#!/bin/bash
# Send the next 30 professor emails every Monday to Thursday at 9:30 am.
# If the Mac is asleep then, the batch starts when it wakes.
#   ./scripts/schedule_mac.sh          turn it on
#   ./scripts/schedule_mac.sh off      turn it off
set -e
cd "$(dirname "$0")/.."
DIR="$(pwd)"
PY="$DIR/.venv/bin/python"
LABEL="com.$(whoami).prof-mailer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$1" = "off" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Scheduled sending is off."
  exit 0
fi

DAYS=""
for day in 1 2 3 4; do  # launchd weekdays: 1 = Monday ... 4 = Thursday
  DAYS="$DAYS<dict><key>Weekday</key><integer>$day</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>"
done

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>$PY</string><string>-u</string><string>send_batch.py</string><string>--background</string>
  </array>
  <key>StartCalendarInterval</key><array>$DAYS</array>
  <key>StandardOutPath</key><string>$DIR/send_log.txt</string>
  <key>StandardErrorPath</key><string>$DIR/send_log.txt</string>
</dict>
</plist>
PLIST
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Scheduled: 30 emails every Monday to Thursday at 9:30 am, until everyone is emailed."
