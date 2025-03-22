import subprocess, os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import redis

REDIS_URI = os.environ.get("REDIS_URI")
INSTANCE_ID = os.environ.get("EC2_INSTANCE_ID")
def get_cache():
    return redis.Redis.from_url(REDIS_URI, decode_responses=True)

def remove_from_cache():
    cache = get_cache()

# Docker commands
GET_ID_COMMAND = 'docker ps --filter "ancestor=codercom/code-server" --format "{{.ID}}"'
GET_CONNECTION_ESTABLISHED_COMMAND = lambda container_id: f'docker logs {container_id} 2>/dev/null | grep "New connection established" | awk \'{{print $1}}\' '
GET_CONNECTION_CLOSED_COMMAND = lambda container_id: f'docker logs {container_id} 2>/dev/null | grep "The client has disconnected gracefully" | awk \'{{print $1}}\' '
GET_STARTED_AT_COMMAND = lambda container_id: f'docker inspect --format "{{{{ .State.StartedAt }}}}" {container_id}'

# Time format constants
LOG_FORMAT = "%H:%M:%S"
STARTED_AT_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"

def get_container_starting_time(container_id):
    try:
        timestamp = subprocess.check_output(GET_STARTED_AT_COMMAND(container_id), shell=True).decode('utf-8').strip()
        if timestamp:
            # Convert to local time zone from UTC
            started_at = datetime.strptime(timestamp[:26], STARTED_AT_FORMAT).replace(tzinfo=timezone.utc).astimezone()
            return started_at.time()
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    return None

def get_container_ids():
    try:
        output = subprocess.check_output(GET_ID_COMMAND, shell=True).decode('utf-8').strip()
        if output:
            return output.split('\n')
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    return []

def is_server_active(start_time, end_time, started_at):
    """
    If both start and end are not present -> Container started but not used yet by the user -> More than 15 minutes -> Inactive
    If end_time is None -> Active
    If start_time > end_time -> Active
    If start_time < end_time -> Active unless (current time - end_time) > 15 mins → Inactive
    """
    current = datetime.now().time()
    IDLE_OFFSET = timedelta(minutes=15)

    started_at_datetime = datetime.combine(datetime.today(), started_at)
    current_datetime = datetime.combine(datetime.today(), current)
    if not start_time and not end_time:
        if current_datetime - started_at_datetime > IDLE_OFFSET:
            return False
        return True

    if not end_time:
        return True
    

    try:
        start = datetime.strptime(start_time, LOG_FORMAT).time() if start_time else started_at
        end = datetime.strptime(end_time, LOG_FORMAT).time()

        if start > end:
            return True
        
        end_datetime = datetime.combine(datetime.today(), end)

        if start < end and (current_datetime - end_datetime) > IDLE_OFFSET:
            return False

        return True
    except ValueError as e:
        print(f"Time parsing error: {e}")
        return False

def get_start_end_time(container_id):
    try:
        # Get last established and closed connection timestamps
        connection_established = subprocess.check_output(
            GET_CONNECTION_ESTABLISHED_COMMAND(container_id), shell=True
        ).decode('utf-8').strip().split("\n")[-1]

        connection_timed_out = subprocess.check_output(
            GET_CONNECTION_CLOSED_COMMAND(container_id), shell=True
        ).decode('utf-8').strip().split("\n")[-1]

        start = connection_established.strip("[]") if connection_established else None
        end = connection_timed_out.strip("[]") if connection_timed_out else None

        started_at = get_container_starting_time(container_id)
        if started_at:
            active = is_server_active(start, end, started_at)

            # Shutdown container if inactive
            if not active:
                shutdown_container(container_id)
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

def shutdown_container(container_id):
    try:
        print(f"Shutting down container {container_id}...")
        subprocess.run(f'docker stop {container_id}', shell=True, check=True)
        subprocess.run(f'docker rm {container_id}', shell=True, check=True)
        print(f"Container {container_id} stopped successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error shutting down container {container_id}: {e}")

def main():
    containers = get_container_ids()
    if not containers:
        print("No running containers found.")
        return
    with ThreadPoolExecutor() as executor:
        executor.map(get_start_end_time, containers)

if __name__ == "__main__":
    main()
