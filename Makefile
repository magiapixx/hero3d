.PHONY: tailwind.default
tailwind.default:
	npx tailwindcss init --full tailwind-default.config.js

.PHONY: run
run:
	npm run dev