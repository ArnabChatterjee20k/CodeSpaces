from mitmproxy import http
from urllib.parse import parse_qs, urlparse, urlencode, urlunparse
from utils import get_user_id_from_token
from cache import get_container_id_by_user, get_container_metadata

# will be always localhost as the codermon is running in the localhost only
TARGET_HOST = "localhost"
STATIC_ASSET_PORT = 3000

def get_token_from_query(url):
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)
    token_list = query_params.get("token", [])
    return token_list[0] if token_list else None

def get_folder_from_url(url):
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)
    folder_list = query_params.get("folder", [])
    return folder_list[0] if folder_list else None

def append_token_if_missing(url, token):
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    if "token" not in query:
        query["token"] = [token]
        new_query = urlencode(query, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    return url

def is_static_path(path):
    return (
        path.startswith("/_static") or
        path.startswith("/stable-") or
        path.endswith("/manifest.json") or
        path.endswith(".css") or
        path.endswith(".js")
    )


async def request(flow: http.HTTPFlow):
    if flow.request.path == "/start":
        flow.response = http.Response.make(401, b"not working")
        return

    token = get_token_from_query(flow.request.url)
    user_id = get_user_id_from_token(token)

    try:
        if is_static_path(flow.request.path):
            # master server incase of getting the assets
            port = STATIC_ASSET_PORT
        else:
            container_id = await get_container_id_by_user(user_id)
            if not container_id:
                flow.response = http.Response.make(401, b"Unauthorized: Invalid or missing token")
                return

            container_metadata = await get_container_metadata(container_id)
            if not container_metadata:
                flow.response = http.Response.make(401, b"Unauthorized: Invalid or missing token")
                return

            port = container_metadata['port']
            if not token or not port:
                flow.response = http.Response.make(401, b"Unauthorized: Invalid or missing token")
                return
            flow.request.path = append_token_if_missing(flow.request.path, token)

        # Update target host and port
        flow.request.host = TARGET_HOST
        flow.request.port = port

        # Force reload
        flow.request.headers.pop("If-Modified-Since", None)
        flow.request.headers.pop("If-None-Match", None)
        flow.request.headers["Cache-Control"] = "no-cache"
        flow.request.headers["Origin"] = f"http://{TARGET_HOST}:{port}"
        flow.request.headers["Host"] = f"{TARGET_HOST}:{port}"
        flow.request.headers["Referer"] = f"http://{TARGET_HOST}:{port}/"

    except Exception as e:
        flow.response = http.Response.make(500, f"Internal Error: {str(e)}".encode())

async def websocket_handshake(flow: http.HTTPFlow):
    request(flow)

async def websocket_message(flow):
    pass
