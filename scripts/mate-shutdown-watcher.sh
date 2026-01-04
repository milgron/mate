#!/bin/bash
# Mate Bot Shutdown Watcher
# Watches for trigger file and executes shutdown/reboot

TRIGGER_FILE="/var/mate/shutdown"

# Ensure directory exists
mkdir -p /var/mate

# Remove any stale trigger file on startup
rm -f "$TRIGGER_FILE"

echo "Mate shutdown watcher started. Watching: $TRIGGER_FILE"

# Watch for trigger file using inotifywait
while true; do
    # Wait for the file to be created or modified
    inotifywait -e create -e modify /var/mate 2>/dev/null

    if [[ -f "$TRIGGER_FILE" ]]; then
        CONTENT=$(cat "$TRIGGER_FILE")
        echo "Trigger detected: $CONTENT"

        # Remove trigger file
        rm -f "$TRIGGER_FILE"

        if [[ "$CONTENT" == reboot:* ]]; then
            echo "Executing reboot..."
            sleep 2
            /sbin/reboot
        else
            echo "Executing shutdown..."
            sleep 2
            /sbin/poweroff
        fi
    fi
done
