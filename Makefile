SHELL := /bin/bash

.PHONY: build-image
docker-image:
	@echo "Building docker image"
	docker build -t dwn-server .

.PHONY: run-container
run-container: docker-image
	@echo "Starting docker image"
	docker container run --init --rm --name dwn-server -p 3000:3000 dwn-server
