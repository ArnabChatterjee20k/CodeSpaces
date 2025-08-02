# TODO: asg id or instance id as label here(
# find a way to get the instance id , might be requesting http://169.254.169.254/latest/meta-data/instance-id during startup
# )
from prometheus_client import (
    CollectorRegistry,
    Counter,
    Histogram
)

registry = CollectorRegistry()

containers_started_total = Counter(
    'containers_started_total',
    'Total number of containers started',
    registry=registry
)

container_start_duration_seconds = Histogram(
    'container_start_duration_seconds',
    'Histogram of container start durations in seconds',
    buckets=[0.1, 0.5, 1, 2.5, 5, 10],
    registry=registry
)

idle_containers_detected_total = Counter(
    'idle_containers_detected_total',
    'Total number of idle containers detected',
    registry=registry
)

container_stop_duration_seconds = Histogram(
    'container_stop_duration_seconds',
    'Histogram of container stop durations in seconds',
    buckets=[0.1, 0.5, 1, 2.5, 5, 10],
    registry=registry
)


orchestrator_update_latency_seconds = Histogram(
    'orchestrator_update_latency_seconds',
    'Latency between orchestrator update command and acknowledgement (in seconds)',
    buckets=[0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registry=registry
)

active_user_container_max_duration = Histogram(
    'active_user_container_max_duration',
    'Histogram of time spend by user',
    # in seconds (5min to 30min)
    buckets=[300, 600, 900, 1200, 1500, 1800],
    registry=registry
)

control_plane_startup_duration_seconds = Histogram(
    'control_plane_startup_duration_seconds',
    'Histogram of control plane startup durations in seconds',
    buckets=[1, 2, 5, 10, 15, 30, 60, 120, 180],
    registry=registry
)