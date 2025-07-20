from pycache.py_cache import PyCache
from pycache.adapters.SQLite import SQLite
from pycache.datatypes.String import String
from pycache.datatypes.Map import Map
from pycache.datatypes.Set import Set

# user_id => container_id
user_cache = PyCache(SQLite("containers.db", "users"))
# container_id => {user_id, port, ...}
container_cache = PyCache(SQLite("containers.db", "containers_metadata"))
# ports metadata
ports_cache = PyCache(SQLite("containers.db", "ports_metadata"))

DEFAULT_TTL_SECONDS = 15 * 60  # 15 minutes


async def initialize_port_pool():
    async with ports_cache.session() as session:
        # 20 ports
        port_set = Set([p for p in range(3001, 3021)])
        await session.set("ports_pool", port_set)

async def get_free_port() -> int | None:
    async with ports_cache.session() as session:
        port_set = await session.get("ports_pool")
        if not port_set or len(port_set) == 0:
            return None

        free_port = next(iter(port_set))
        port_set.remove(free_port)
        await session.set("ports_pool", Set(port_set))
        return int(str(free_port))

async def release_port(port: int):
    async with ports_cache.session() as session:
        port_set: Set = await session.get("ports_pool")
        port_set.add(port)
        await session.set("ports_pool", Set(port_set))


async def set_user_container(user_id: str, container_id: str, port: int, ttl: int = DEFAULT_TTL_SECONDS):
    async with user_cache.session() as user_session, container_cache.session() as container_session:
        # user_id => container_id
        await user_session.set(user_id, String(container_id))
        await user_session.set_expire(user_id, ttl)
        
        # Save container_id => Map(user_id, port)
        metadata = Map({
            "user_id": user_id,
            "port": port,
        })
        await container_session.set(container_id, metadata)
        await container_session.set_expire(container_id, ttl)

async def update_ttl(user_id: str, ttl: int = DEFAULT_TTL_SECONDS):
    async with user_cache.session() as user_session:
        container_id = await user_session.get(user_id)

    if container_id:
        container_id = str(container_id)
        async with container_cache.session() as container_session:
            metadata = await container_session.get(container_id)

        if metadata:
            # Re-set both with updated TTL
            async with user_cache.session() as user_session, container_cache.session() as container_session:
                await user_session.set(user_id, String(container_id))
                await user_session.set_expire(user_id, ttl)

                await container_session.set(container_id, metadata)
                await container_session.set_expire(container_id, ttl)

async def remove_user_by_id(user_id: str):
    async with user_cache.session() as user_session:
        container_id = await user_session.get(user_id)

    if container_id:
        container_id = str(container_id)
        async with container_cache.session() as container_session:
            await container_session.delete(container_id)
        async with user_cache.session() as user_session:
            await user_session.delete(user_id)

async def remove_container_by_id(container_id: str):
    async with container_cache.session() as container_session:
        metadata = await container_session.get(container_id)
    if metadata and "user_id" in metadata:
        user_id = metadata["user_id"]
        port = metadata["port"]
        await release_port(port)
        async with user_cache.session() as user_session:
            await user_session.delete(user_id)

    async with container_cache.session() as container_session:
        await container_session.delete(container_id)

async def get_container_metadata(container_id: str):
    async with container_cache.session() as container_session:
        metadata = await container_session.get(container_id)
        return metadata

async def get_container_id_by_user(user_id: str):
    async with user_cache.session() as user_session:
        container_id = await user_session.get(user_id)
        return str(container_id) if container_id else None
    
async def get_user_id_by_container(container_id: str):
    async with container_cache.session() as session:
        user_id = await session.get(container_id)
        return str(user_id) if user_id else None
