import requests

def orchastrator_ask_for_conatiner():
    url = "http://localhost:8000/start"

    resp = requests.post(url=url,params={"token":"secret-1"})
    print(resp.json())

orchastrator_ask_for_conatiner()