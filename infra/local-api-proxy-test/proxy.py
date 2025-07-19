from mitmproxy import http
from urllib.parse import parse_qs, urlparse, urlencode, urlunparse


TARGET_HOST = "localhost"

TOKEN_DB = {
    "secret-1":"user1",
    "secret-2":"user2"
}

USER_SERVER_DB = {
    "user1":3001,
    "user2":3002
}

def get_token_from_query(url):
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)
    token_list = query_params.get("token", [])
    return token_list[0] if token_list else None


def get_port_for_token(token):
    user = TOKEN_DB.get(token)
    if not user:
        return None
    return USER_SERVER_DB.get(user)

def get_folder_from_url(url):
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)
    token_list = query_params.get("folder", [])
    return token_list[0] if token_list else None

def append_token_if_missing(url, token):
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    if "token" not in query:
        query["token"] = [token]
        new_query = urlencode(query, doseq=True)
        new_url = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            new_query,
            parsed.fragment
        ))
        return new_url
    return url

def is_static_path(path):
    return (
        path.startswith("/_static") or
        path.startswith("/stable-") or
        path.endswith("/manifest.json") or
        path.endswith(".css") or
        path.endswith(".js")
    )

def request(flow: http.HTTPFlow):
    if flow.request.path == "/start":
        flow.response = http.Response.make(401,"not working")
        return

    token = get_token_from_query(flow.request.url)
    port = get_port_for_token(token)

    if is_static_path():
        # TODO: might be the hack to be running a master server to get the static cached assets
        port = 3002
    else:
        if not token or not port:
            flow.response = http.Response.make(401, b"Unauthorized: Invalid or missing token")
            return
        if token:
            flow.request.path = append_token_if_missing(flow.request.path, token)

    # Update destination (important for regular mode)
    flow.request.host = TARGET_HOST
    flow.request.port = port


    flow.request.headers.pop("If-Modified-Since", None)
    flow.request.headers.pop("If-None-Match", None)
    flow.request.headers["Cache-Control"] = "no-cache"

    flow.request.headers["Origin"] = f"http://{TARGET_HOST}:{port}"
    flow.request.headers["Host"] = f"{TARGET_HOST}:{port}"
    flow.request.headers["Referer"] = f"http://{TARGET_HOST}:{port}/"

def websocket_handshake(flow: http.HTTPFlow):
    # Ensure cookies and headers are untouched (if upstream needs them)
    request(flow)  # Reuse same logic from HTTP

def websocket_message(flow):
    # This just allows websocket messages to pass
    pass
