import jwt
import asyncio

# Must be same as the orchestrator
SECRET_KEY = "your-secret-key"

def get_user_id_from_token(token):
    try:
        decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = decoded.get("userId")
        print(f"userId: {user_id}")
        return user_id
    except jwt.ExpiredSignatureError:
        print("Token has expired")
    except jwt.InvalidTokenError:
        print("Invalid token")
    
    return None

def get_token(user_id):
    return jwt.encode({"userId": user_id}, SECRET_KEY, algorithm="HS256")

async def run_command(command):
    """Run shell command asynchronously and return stdout as string."""
    process = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    if process.returncode == 0:
        return stdout.decode().strip()
    else:
        raise Exception(f"Command failed: {command}\n{stderr.decode().strip()}")