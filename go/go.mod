module github.com/tabnas/jsonc/go

go 1.24.7

require github.com/tabnas/jsonic/go v0.0.0

require (
	github.com/tabnas/debug/go v0.0.0-00010101000000-000000000000 // indirect
	github.com/tabnas/json/go v0.0.0-00010101000000-000000000000 // indirect
	github.com/tabnas/parser/go v0.0.0 // indirect
)

replace github.com/tabnas/jsonic/go => ../../jsonic/go

replace github.com/tabnas/parser/go => ../../parser/go

replace github.com/tabnas/json/go => ../../json/go

replace github.com/tabnas/debug/go => ../../debug/go
