import os
import asyncio
from datetime import datetime, timedelta, timezone
from utils import run_command
from cache import get_user_id_by_container, update_ttl, set_user_container, remove_container_by_id
from metrics import active_user_container_max_duration, idle_containers_detected_total, container_stop_duration_seconds

# Docker commands
GET_ID_COMMAND = 'docker ps --filter "ancestor=codercom/code-server" --format "{{.ID}}"'
GET_CONTAINER_INSPECT_COMMAND = lambda cid: f'docker inspect --format "{{{{.Id}}}}" {cid}'
GET_CONNECTION_ESTABLISHED_COMMAND = lambda container_id: f'docker logs {container_id} 2>/dev/null | grep "New connection established" | awk \'{{print $1}}\' '
GET_CONNECTION_CLOSED_COMMAND = lambda container_id: f'docker logs {container_id} 2>/dev/null | grep "The client has disconnected gracefully" | awk \'{{print $1}}\' '
GET_STARTED_AT_COMMAND = lambda container_id: f'docker inspect --format "{{{{ .State.StartedAt }}}}" {container_id}'
START_CONTAINER_COMMAND = lambda port: " ".join([
            "docker", "run", "-d",
            "-p", f"{port}:8080",
            "--name", f"codermon_{port}",
            "--rm",
            "codercom/code-server",
            "--auth", "none"
        ])
GET_CONTAINER_BY_PORT_COMMAND = lambda port: f"docker ps --format '{{{{.Names}}}} {{{{.Ports}}}}' | grep ':{port}->' | awk '{{print $1}}'"
GET_PORT_BY_CONTAINER_ID = lambda cid: f'docker ps --filter "id={cid}" --format "{{{{.Ports}}}}"'

# Time format constants
LOG_FORMAT = "%H:%M:%S"
STARTED_AT_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"

# Static assest container port
STATIC_ASSET_PORT = 3000

async def get_container_starting_time(container_id):
    try:
        timestamp = await run_command(GET_STARTED_AT_COMMAND(container_id))
        if timestamp:
            started_at = datetime.strptime(timestamp[:26], STARTED_AT_FORMAT).replace(tzinfo=timezone.utc).astimezone()
            return started_at.time()
    except Exception as e:
        print(f"Unexpected error in get_container_starting_time: {e}")
    return None

async def get_container_ids():
    try:
        short_ids_output = await run_command(GET_ID_COMMAND)
        short_ids = [cid.strip() for cid in short_ids_output.split('\n') if cid.strip()]
        
        if not short_ids:
            return []

        # Run `inspect` on each container to get full ID
        tasks = [
            run_command(GET_CONTAINER_INSPECT_COMMAND(cid))
            for cid in short_ids
        ]
        full_ids_output = await asyncio.gather(*tasks)
        return [cid.strip() for cid in full_ids_output if cid.strip()]
    
    except Exception as e:
        print(f"Unexpected error in get_container_ids: {e}")
        return []


def is_server_active(start_time, end_time, started_at):
    """
    If both start and end are not present -> Container started but not used yet by the user -> More than 15 minutes -> Inactive
    If end_time is None -> Active
    If start_time > end_time -> Active
    If start_time < end_time -> Active unless (current time - end_time) > 15 mins → Inactive
    """
    current = datetime.now().time()
    IDLE_OFFSET = timedelta(minutes=5)

    started_at_datetime = datetime.combine(datetime.today(), started_at)
    current_datetime = datetime.combine(datetime.today(), current)

    if not start_time and not end_time:
        return (current_datetime - started_at_datetime) <= IDLE_OFFSET

    if not end_time:
        return True

    try:
        start = datetime.strptime(start_time, LOG_FORMAT).time() if start_time else started_at
        end = datetime.strptime(end_time, LOG_FORMAT).time()
        end_datetime = datetime.combine(datetime.today(), end)

        if start > end:
            return True

        return (current_datetime - end_datetime) <= IDLE_OFFSET
    except ValueError as e:
        print(f"Time parsing error: {e}")
        return False

async def monitor_container(container_id):
    try:
        port = await run_command(GET_PORT_BY_CONTAINER_ID(container_id))
        # output is like 0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp
        if f"{STATIC_ASSET_PORT}" in port:
            print(f"Static asset container with {container_id} ignored")
            return
        established = await run_command(GET_CONNECTION_ESTABLISHED_COMMAND(container_id))
        timed_out = await run_command(GET_CONNECTION_CLOSED_COMMAND(container_id))

        start = established.strip("[]").split('\n')[-1] if established else None
        end = timed_out.strip("[]").split('\n')[-1] if timed_out else None
        
        if start and start.startswith("["):
            start = start[1:]
        if end and end.startswith("["):
            end = end[1:]

        started_at = await get_container_starting_time(container_id)

        if started_at:
            active = is_server_active(start, end, started_at)

            print(f"[{container_id}] Start: {start}, End: {end}, Started At: {started_at}")
            print(f"[{container_id}] Active: {active}")

            # Shutdown container if inactive else update the ttl
            if active:
                user_id = await get_user_id_by_container(container_id)
                await update_ttl(user_id)
            else:
                with container_stop_duration_seconds.time():
                    await shutdown_container(container_id)
                idle_containers_detected_total.inc()
                # observing user session duration
                try:
                    start = datetime.strptime(start,LOG_FORMAT)
                    end = datetime.strptime(end,LOG_FORMAT)
                    duration = (end - start).total_seconds()
                    if duration>0:
                        active_user_container_max_duration.observe(duration)
                except Exception as e:
                    print(f"Error calculating container usage duration: {e}")
                    
            
    except Exception as e:
        print(f"Unexpected error in monitor_container: {e}")

async def start_container(port: int,user_id:str):
    container_id = await run_command(START_CONTAINER_COMMAND(port))
    print(f"Started codermon on port {port} with container ID: {container_id}")
    await set_user_container(container_id=container_id,user_id=user_id,port=port)
    return container_id

async def start_static_assert_container():
    is_running = await run_command(GET_CONTAINER_BY_PORT_COMMAND(STATIC_ASSET_PORT))
    if not is_running:
        await run_command(START_CONTAINER_COMMAND(STATIC_ASSET_PORT))
    
async def shutdown_container(container_id):
    try:
        print(f"Shutting down container {container_id}...")
        await run_command(f'docker stop {container_id}')
        # await run_command(f'docker rm {container_id}')
        await remove_container_by_id(container_id)
        print(f"Container {container_id} stopped successfully.")
    except Exception as e:
        print(f"Error shutting down container {container_id}: {e}")

async def monitor_containers():
    print("Starting monitoring for containers...")
    ONE_MINUTE = 60
    while True:
        try:
            print("searching containers.....")
            containers = await get_container_ids()
            if not containers:
                print("No running containers found.")
            else:
                await asyncio.gather(*(monitor_container(cid) for cid in containers))
        except Exception as e:
            print(f"Error during monitoring loop: {e}")
        finally:
            await asyncio.sleep(ONE_MINUTE)