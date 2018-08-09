# PBPP (pronounced: 😜)
Protocol Buffer Pretty Printer

`ppbp` can convert between JSON representations (using [protobuf.js](https://www.npmjs.com/package/protobufjs)) and binary representations of messages conforming to message tyeps defined in Google's Protobufs `.proto` file format.

`ppbp` can also connect to a Kafka topic.

`ppbp` can pretty-print messages using [prettyjson](https://www.npmjs.com/package/prettyjson).

When reading JSON from `stdin`, JSON messages are read from `stdin` until EOF. Each JSON document is expected to be on [its own line](http://ndjson.org/) of input.

## Example Invocations

### Producing a Message
This example:
1) Adds `.` to the list of directories to search for `.proto` files
2) Searches for and loads `my.proto`
3) Connects to Zookeeper on `localhost:2181` for broker discovery
4) Reads a multi-line JSON document from a file `message.json`, converting its newlines into spaces to make it fit on one line using `tr`
5) Serializes that message as a `myprotobufpackage.MyProtobufMessageType`
6) Produces that serialized message to the topic `my-topic`
7) Exits due to EOF on `stdin`
```
tr '\n' ' ' < message.json | \
  pbpp -e -p -z localhost:2181 -t my-topic \
  -I . my.proto myprotobufpackage.MyProtobufMessageType \
  --stringEnums
```

### Monitoring a Topic
This example:
1) Adds `.` to the list of directories to search for `.proto` files
2) Searches for and loads `my.proto`
3) Connects to Zookeeper on `localhost:2181` for broker discovery
4) Begins consuming the topic `my-topic`
5) Deserializes received messages as a `myprotobufpackage.MyProtobufMessageType`
6) Pretty prints that message to `stdout`
7) Will read until disconnect or signal
```
pbpp -d -p -z localhost:2181 -t my-topic \
  -I . my.proto myprotobufpackage.MyProtobufMessageType \
  --stringEnums
```

### Pretty printing
If you only want to encode and pretty-print a message:
```
tr '\n' ' ' < ex1.json | \
pbpp -e -p -T -N \
  -I . my.proto myprotobufpackage.MyProtobufMessageType \
  --stringEnums
```

## Usage Details
```
  Usage: pbpp [options]

  Options:

    -V, --version           output the version number
    -e, --encode            Read newline-delimited JSON from stdin and produce protobuf-encoded to Kafka
    -d, --decode            Consume encoded protobuf from Kafka and write JSON
    -p, --pretty            Pretty-print on stdout (instead of printing JSON)
    -I, --include [path]    Add directory to search for .proto files (can use more than once; defaults to cwd)
    -z, --zookeeper [addr]  Zookeeper address
    -t, --topic [topic]     Topic to interact with (instead of stdin/stdout)
    -T, --stdio             Connect both ends to stdin/stdout
    --defaults              Enable defaults in decoded output
    --stringEnums           Enable string enums in dec
```
