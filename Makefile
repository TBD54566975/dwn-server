SHELL := /bin/bash

.PHONY: build-image
docker-image:
	@echo "Building docker image"
	docker build -t dwn-aggregator .

.PHONY: run
run: docker-image
	@echo "Starting docker image"
	docker container run --name dwn-aggregator -p 3000:3000 dwn-aggregator