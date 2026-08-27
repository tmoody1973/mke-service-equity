from pipelines.common import WORKSPACE_NAME


def test_python_workspace_is_importable() -> None:
    assert WORKSPACE_NAME == "mke-service-equity-data"
