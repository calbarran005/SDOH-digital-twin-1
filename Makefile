.PHONY: up down build logs backend frontend seed migrate seed-all psql clean

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

backend:
	docker compose exec backend bash

frontend:
	docker compose exec frontend sh

seed:
	docker compose exec backend python -m app.scripts.seed

seed-etl:
	docker compose exec backend python -m app.scripts.etl_pipeline

migrate:
	docker compose exec backend python -m app.scripts.migrate

psql:
	docker compose exec db psql -U sdohtwin

clean:
	docker compose down -v
