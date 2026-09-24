"""Smoke tests for the Pydantic models generated from the OpenAPI contract."""

import pytest
from pydantic import ValidationError

from equipment_maintenance_hub.models.generated import HealthStatus


def test_health_status_accepts_contract_value() -> None:
    assert HealthStatus.model_validate({"status": "ok"}).status == "ok"


def test_health_status_rejects_values_outside_contract() -> None:
    with pytest.raises(ValidationError):
        HealthStatus.model_validate({"status": "degraded"})
