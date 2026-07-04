"""Tests del módulo de tags: CRUD, asignación a conexiones y filtrado de listas."""

from fastapi.testclient import TestClient

_CONNECTION_PAYLOAD = {
    "name": "DW Municipal",
    "engine": "postgresql",
    "host": "db.interno",
    "port": 5432,
    "database": "indicadores",
    "username": "lector",
    "password": "s3creto-real",
    "ssl_enabled": False,
    "read_only": True,
}


def _create_tag(client: TestClient, name: str, color: str = "blue") -> dict:
    res = client.post("/api/admin/tags", json={"name": name, "color": color})
    assert res.status_code == 201, res.text
    return res.json()


def test_create_and_list_tags(client: TestClient) -> None:
    tag = _create_tag(client, "finanzas")
    assert tag["color"] == "blue"
    res = client.get("/api/admin/tags")
    assert res.status_code == 200
    assert [t["name"] for t in res.json()] == ["finanzas"]


def test_duplicate_tag_name_returns_409(client: TestClient) -> None:
    _create_tag(client, "salud")
    res = client.post("/api/admin/tags", json={"name": "salud", "color": "green"})
    assert res.status_code == 409


def test_assign_tags_to_connection_and_filter(client: TestClient) -> None:
    finanzas = _create_tag(client, "finanzas")
    salud = _create_tag(client, "salud")

    con_a = client.post(
        "/api/admin/connections",
        json={**_CONNECTION_PAYLOAD, "name": "A", "tag_ids": [finanzas["id"], salud["id"]]},
    ).json()
    con_b = client.post(
        "/api/admin/connections",
        json={**_CONNECTION_PAYLOAD, "name": "B", "tag_ids": [salud["id"]]},
    ).json()

    assert {t["name"] for t in con_a["tags"]} == {"finanzas", "salud"}
    assert {t["name"] for t in con_b["tags"]} == {"salud"}

    # Filtro por un solo tag: ambas conexiones.
    res = client.get("/api/admin/connections", params={"tag_ids": [salud["id"]]})
    names = {c["name"] for c in res.json()}
    assert names == {"A", "B"}

    # Filtro AND por los dos tags: solo A.
    res = client.get(
        "/api/admin/connections", params={"tag_ids": [finanzas["id"], salud["id"]]}
    )
    names = {c["name"] for c in res.json()}
    assert names == {"A"}

    # Búsqueda de texto por nombre.
    res = client.get("/api/admin/connections", params={"q": "B"})
    names = {c["name"] for c in res.json()}
    assert names == {"B"}


def test_update_connection_replaces_tags(client: TestClient) -> None:
    finanzas = _create_tag(client, "finanzas")
    salud = _create_tag(client, "salud")
    con = client.post(
        "/api/admin/connections",
        json={**_CONNECTION_PAYLOAD, "tag_ids": [finanzas["id"]]},
    ).json()

    res = client.put(
        f"/api/admin/connections/{con['id']}", json={"tag_ids": [salud["id"]]}
    )
    assert res.status_code == 200
    assert [t["name"] for t in res.json()["tags"]] == ["salud"]


def test_delete_tag_untags_connection_without_deleting_it(client: TestClient) -> None:
    finanzas = _create_tag(client, "finanzas")
    con = client.post(
        "/api/admin/connections",
        json={**_CONNECTION_PAYLOAD, "tag_ids": [finanzas["id"]]},
    ).json()

    res = client.delete(f"/api/admin/tags/{finanzas['id']}")
    assert res.status_code == 204

    res = client.get(f"/api/admin/connections/{con['id']}")
    assert res.status_code == 200
    assert res.json()["tags"] == []
