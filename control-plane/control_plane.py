import asyncio
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Awaitable, Callable
from pydantic import BaseModel
from codermon import monitor_containers, start_static_assert_container
from cache import get_containers
from utils import get_token
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from metrics import *
import os

from cache import (
    initialize_port_pool,
    get_free_port,
    set_user_container,
    get_container_id_by_user
)
from codermon import start_container

# should be set in the .env and a secret key
X_ORCHASTRATOR_KEY = os.environ.get("X_ORCHASTRATOR_KEY","TOKEN")
ORCHASTRATOR_URL = os.environ.get("ORCHASTRATOR_URL")
PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL")
PROMETHEUS_AUTHORISATION_AUTHORISATION_KEY = os.environ.get("X_ORCHASTRATOR_KEY","TOKEN")

from contextlib import asynccontextmanager
from fastapi import FastAPI

def is_valid_orchastrator(headers:dict):
    return headers.get("X-ORCHASTRATOR_KEY") == X_ORCHASTRATOR_KEY

def is_valid_metrics_server(headers:dict):
    auth = headers.get("authorization")
    if not auth:
        return False
    try:
        token = auth.split(" ")[1]
        return token == PROMETHEUS_AUTHORISATION_AUTHORISATION_KEY
    except Exception:
        return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    with control_plane_startup_duration_seconds.time():
        await asyncio.gather(
            initialize_port_pool(),
            start_static_assert_container()
        )
        asyncio.create_task(monitor_containers())
    yield
control_plane = FastAPI(lifespan=lifespan)

@control_plane.middleware("http")
async def validate_orchastrator(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    if request.url.path == "/health":
        return await call_next(request)

    headers = request.headers
    if not any([is_valid_metrics_server(headers),is_valid_orchastrator(headers)]):
        return JSONResponse("Not orchastrator", 403)

    return await call_next(request)

control_plane.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1", ORCHASTRATOR_URL,PROMETHEUS_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ContainerStartModel(BaseModel):
    user_id: str

@control_plane.get("/health")
async def health():
    return "ok"

# TODO: use background_task dependency of fastapi to record metrics instead of in the controller.
# or use yield based dependency

@control_plane.post("/start")
async def start(payload: ContainerStartModel, request: Request):
    with orchestrator_update_latency_seconds.time():
        # Check if the user already has an active container
        container_id = await get_container_id_by_user(payload.user_id)
        if container_id:
            return JSONResponse({"url": f"{request.base_url.hostname}:5000?token={get_token(payload.user_id)}"}, 200)

        port = await get_free_port()
        if not port:
            return JSONResponse({"message": "No free port available"}, 401)
        with container_start_duration_seconds.time():
            container_id = await start_container(port, payload.user_id)
        await set_user_container(payload.user_id, container_id, port)
        containers_started_total.inc()
        return JSONResponse({"url": f"{request.base_url.hostname}:5000?token={get_token(payload.user_id)}"}, 200)


@control_plane.get("/report")
async def report():
    containers:dict = await get_containers()
    count = len(containers)
    containers_report = [{  
                        "user_id": container.get("user"),
                        "container_id": container_id,
                        "port": container.get("port")
                        } 
                        for container_id,container in containers.items()]
    return JSONResponse({
        "count": count,
        "containers": containers_report
    })

@control_plane.route('/metrics')
def metrics(*args):
    data = generate_latest(registry)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)