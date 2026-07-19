.PHONY: run build preview lint

run:
	npm run dev

build:
	npm run build

preview:
	npm run preview

lint:
	npx tsc --noEmit && npx eslint src
