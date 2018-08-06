#!/usr/bin/env node
/* TODO rewrite in reason */
/* NOTE this tool has a bit of asymmetry in it: when decoding from stdin, only
 * a single message will be processed, as opposed to when either encoding
 * and/or when consuming from kafka where multiple messages can be handled. The
 * reason for there is that I have no mechanism for framing serialized protobuf
 * messages. If you have one, add it! */
const Protobuf = require('protobufjs')
const argv = require('commander')
const util = require('util')
const highland = require('highland')
const Kafka = require('kafka-node')
const readAllStream = require('read-all-stream')
const prettyJson = require('prettyjson')
const pretty = prettyJson.render
const fs = require('fs')
const Path = require('path')
const include = []

argv
  .version('0.0.0')
  .option('-e, --encode',           'Read newline-delimited JSON from stdin and produce protobuf-encoded to Kafka')
  .option('-d, --decode',           'Consume encoded protobuf from Kafka and write JSON')
  .option('-p, --pretty',           'Pretty-print on stdout (instead of printing JSON)')
  .option('-I, --include [path]',   'Add directory to search for .proto files (can use more than once; defaults to cwd)')
  .on('option:include', dir => include.push(dir))
  .option('-z, --zookeeper [addr]', 'Zookeeper address')
  .option('-t, --topic [topic]',    'Topic to interact with (instead of stdin/stdout)')
  .option('-T, --stdio',            'Connect both ends to stdin/stdout')
  .option('--defaults',             'Enable defaults in decoded output')
  .option('--stringEnums',          'Enable string enums in decoded output')
  .option('-g, --groupId [gid]',    'Override default group id (pbpp-<topic-name>)')
  .parse(process.argv)

if (argv.encode == argv.decode) {
  console.error('you must specify either -e or -d')
  process.exit(1)
}

if (argv.topic && argv.stdio) {
  console.error('you must not specify both -t and -T')
  process.exit(1)
}
if (!argv.topic && !argv.stdio)
  argv.stdio = true

if (argv.args.length != 2) {
  console.error('please specify your .proto file and your message type')
  process.exit(1)
}

if (include.length == 0)
  include.push('.')

if ('string' != typeof argv.topic) {
  console.error("what topic do you want? maybe you misused -t?")
  process.exit(1)
}

const zookeeper = argv.zookeeper || process.env.ZOOKEEPER
if (!argv.stdio && !zookeeper) {
  console.error('please supply -z or ZOOKEEPER environment variable')
  process.exit(1)
}

const protoFilename = argv.args[0]
const messageTypeName = argv.args[1]

/* Load protos */
const root = new Protobuf.Root();
root.resolvePath = (origin, target) => {
  for (let i = 0; i < include.length; i++) {
    const path = Path.join(include[i], target)
    if (fs.existsSync(path))
      return path
  }
  console.error('warning: could not find', target, 'needed by', origin)
  return null;
}
root.loadSync(protoFilename)
const messageType = root.lookupType(messageTypeName)

if (messageType === null) {
  console.error(`error: could not find message type "${messageTypeName}" in proto file "${protoFilename}"`)
  process.exit(1)
}
const encode = msgJson => messageType.encode(msgJson).finish()
const fromObject = msgJson => messageType.fromObject(msgJson)
const decode = buffer => messageType.decode(buffer)
const toObjectOptions = {
  enums: argv.stringEnums ? String : void 0,
  defaults: argv.defaults
}
const toObject = message => messageType.toObject(message, toObjectOptions)

/* TODO protobufjs' verify() method does not check for "extra" properties. we should */
const verify = msgJson => {
  const error = messageType.verify(msgJson)
  if (error) {
    console.error(error)
    return false
  }
  return true
}

if (!argv.stdio)
  console.log('connecting to zookeeper at', zookeeper)
const client = new Kafka.Client(zookeeper)
const topic = argv.topic
const groupId = argv.groupId || `pbpp-${topic}`

if (argv.encode) {
  highland(process.stdin)
  .splitBy('\n')
  .filter(line => line.length > 0)
  .map(JSON.parse)
  .filter(verify)
  .map(fromObject)
  .tap(msgObject => process.stdio || console.log('producing:', maybePretty(toObject(decode(encode(msgObject))))))
  .map(encode)
  .each(buffer => {
    if (process.stdio)
      process.stdout.write(buffer)
    else {
      producer = (argv.encode && argv.topic) ? new Kafka.Producer(client) : null
      producer.on('ready', () => {
        producer.send([{ topic, messages: [buffer], key: 'a key i guess' }], (err, res) => {
          if (err) {
            /* TODO use instanceof? */
            if (err.constructor.name == 'BrokerNotAvailableError') {
              console.error(`broker not available; is your topic name "${topic}" misspelled? does your topic exist?`)
            } else {
              console.error('unknown error:', err)
            }
            process.exit(1)
          } else {
            console.log('successful produce:', res)
            process.exit(0)
          }
        })
      })
    }
  })
}

if (argv.decode) {
  if (!argv.stdio) {
    const consumer = new Kafka.Consumer(client, [{ topic }], { fromOffset: false, encoding: 'buffer', groupId })
    consumer.on('message', receipt => {
      const buffer = receipt.value
      const jsonMsg = toObject(decode(buffer))
      if (argv.pretty)
        console.log(pretty(jsonMsg))
      else
        console.log(JSON.stringify(jsonMsg))
    })
  } else {
    console.warn('notice: decoding a SINGLE message!')
    const buffer = readAllStream(process.stdin)
    const jsonMsg = toObject(decode(buffer))
    if (argv.pretty)
      console.log(pretty(jsonMsg))
    else
      console.log(JSON.stringify(jsonMsg))
  }
}

//function pretty(x) {
//  return util.inspect(x, {depth:999})
//}

function maybePretty(x) {
  return argv.pretty ? pretty(x) : JSON.stringify(x)
}
