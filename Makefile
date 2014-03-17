
JS='require("./node_modules/jade/package.json").version'
UPSTREAM_VERSION=$(shell node -p $(JS))

upstream:
	[ -d test/jade ] || (cd test; node ../node_modules/gethub/bin/gethub visionmedia/jade $(UPSTREAM_VERSION))
test:	upstream
	./node_modules/.bin/mocha --reporter spec

clean:
	@$(RM) -r test/output
	@$(RM) -r test/jade
	@$(RM) test/npm-debug.log

.PHONY: clean upstream test
