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
import os

from cache import (
    initialize_port_pool,
    get_free_port,
    set_user_container,
    get_container_id_by_user,
    get_container_metadata
)
from codermon import start_container

# should be set in the .env and a secret key
X_ORCHASTRATOR_KEY = os.environ.get("X_ORCHASTRATOR_KEY","TOKEN")
ORCHASTRATOR_URL = os.environ.get("ORCHASTRATOR_URL")
mitm_process = None

from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    global mitm_process

    await asyncio.gather(
        initialize_port_pool(),
        start_static_assert_container()
    )

    yield
control_plane = FastAPI(lifespan=lifespan)

@control_plane.middleware("http")
async def validate_orchastrator(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    if request.url.path == "/health":
        return await call_next(request)

    token = request.headers.get("X-ORCHASTRATOR_KEY")
    if token != X_ORCHASTRATOR_KEY:
        return JSONResponse("Not orchastrator", 403)

    return await call_next(request)

control_plane.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1", ORCHASTRATOR_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ContainerStartModel(BaseModel):
    user_id: str

@control_plane.get("/health")
async def health():
    return "ok"

@control_plane.post("/start")
async def start(payload: ContainerStartModel, request: Request):
    # Check if the user already has an active container
    container_id = await get_container_id_by_user(payload.user_id)
    if container_id:
        metadata = await get_container_metadata(container_id)
        if metadata:
            return JSONResponse({"url": f"{request.base_url.hostname}:5000?token={get_token(payload.user_id)}"}, 200)

    port = await get_free_port()
    if not port:
        return JSONResponse({"message": "No free port available"}, 401)

    container_id = await start_container(port, payload.user_id)
    await set_user_container(payload.user_id, container_id, port)

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