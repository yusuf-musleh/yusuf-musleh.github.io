Title: mmar - Devlog 2
Description: Restructuring Server-Client implementation and introducing new messaging protocol.
Date: 2024-10-25 12:00
Tags: mmar, golang, devlog

*This post is part of a devlog series documenting my progress building `mmar`, a cross-platform tunnel that exposes your localhost to the world. If you'd like to follow along from the beginning, you can find all the devlogs [here](/tags/mmar.html).*

## Progress Update

Since my last devlog, there’s been quite a bit of updates. When I started off with the project, my intention was to be a scrappy, discover what I need to implement as I build and use `mmar`, then go back and refactor, as opposed to optimizing everything from the beginning.

This approach really helped me understand exactly *why* I need to implement something, rather than just building it because I heard/read about it somewhere. It’s also great seeing your code evolve.

Let’s go through the updates made, there’s a lot more code in this devlog.

## Restructured Server-Client Implementation

You may remember from the [previous devlog](/mmar-devlog-001.html), the setup I had was that the `mmar` server gets requests, forwards them to the `mmar` client, which then gets a response from localhost and sends it back. This worked great, however there was a bunch of assumptions I was making in this implementation. 

The main assumption I had was that server would **only receive HTTP responses** from the client and that the client would **only receive HTTP requests** from the server.

This quickly became an issue when I needed to handle cases other than the happy path of request —> response. For example, I wanted the server to know when the client disconnects or is shutdown. Limiting myself to this request-response assumption made it quite rigid to implement different functionalities and communications between the server and client. I found myself hacking around that, creating "responses" that represented different states, all to conform to my assumption.

This is where the need to have a more flexible/extendible protocol that allows 2-way communication between the server and client without the limitations of requests/responses. I discuss the details of the message protocol in the next section (it’s pretty basic :D), but here I will go through how I restructured the server and client to handle different types of messages being sent to each other.

First, I make a distinction between `ClientTunnel` (tunnel to the client) and `ServerTunnel` (tunnel to the server), and embed the shared fields in the structs, previously it was just `Tunnel`.

```go
type Tunnel struct {
	id   string
	conn net.Conn
}

// Tunnel to Client
type ClientTunnel struct {
	Tunnel
	incomingChannel chan IncomingRequest
	outgoingChannel chan TunnelMessage
}

// Tunnel to Server
type ServerTunnel struct {
	Tunnel
}
```

Next, I created an interface that tunnels would implement, this allows the tunnels to handle different types messages:

```go
type TunnelInterface interface {
	processTunnelMessages(ctx context.Context)
}
```

And moved the logic for receiving messages to the `Tunnel` struct:

```go
func (t *Tunnel) receiveMessage() (TunnelMessage, error) {
	msgReader := bufio.NewReader(t.conn)

	// Read and deserialize tunnel message data
	tunnelMessage := TunnelMessage{}
	deserializeErr := tunnelMessage.deserializeMessage(msgReader)

	return tunnelMessage, deserializeErr
}
```

Making this change allowed for the decoupling of processing *messages* and processing *requests/responses*. Now there is one place (in each of the client and server) that handles reading from the TCP connection, simplifying the logic and preventing multiple goroutines stepping on each others toes reading data from the same connection.

### Handling Messages on Server

On the server side when dealing with messages coming from a client, it looks like this:

```go
func (ct *ClientTunnel) processTunnelMessages() {
	for {
		tunnelMsg, err := ct.receiveMessage()
		if err != nil {
			log.Fatalf("Failed to receive message from client tunnel: %v", err)
		}

		switch tunnelMsg.msgType {
		case RESPONSE:
			ct.outgoingChannel <- tunnelMsg
		case LOCALHOST_NOT_RUNNING:
			// Create a response for Tunnel connected but localhost not running
			resp := TunnelErrStateResp(LOCALHOST_NOT_RUNNING)
			// Writing response to buffer to tunnel it back
			var responseBuff bytes.Buffer
			resp.Write(&responseBuff)
			notRunningMsg := TunnelMessage{msgType: RESPONSE, msgData: responseBuff.Bytes()}
			ct.outgoingChannel <- notRunningMsg
		case CLIENT_DISCONNECT:
			ct.close()
			return
		}
	}
}
```

Notice how this allows us to easily add new types of messages and logic to handle them.

### Handling Messages on Client

Similarly on the client side, we also deal with different types of messages from the server:

```go
func (st *ServerTunnel) processTunnelMessages(ctx context.Context) {
	for {
		select {
		case <-ctx.Done(): // Client gracefully shutdown
			return
		default:
			tunnelMsg, err := st.receiveMessage()
			if err != nil {
				if errors.Is(err, io.EOF) {
					log.Print("Tunnel connection closed from Server. Exiting...")
					os.Exit(0)
				} else if errors.Is(err, net.ErrClosed) {
					log.Print("Tunnel connection disconnected from Server. Existing...")
					os.Exit(0)
				}
				log.Fatalf("Failed to receive message from server tunnel: %v", err)
			}

			switch tunnelMsg.msgType {
			case REQUEST:
				log.Printf("Got REQUEST TUNNEL MESSAGE\n")
				go st.handleRequestMessage(tunnelMsg)
			}
		}
	}
}
```

Currently, I only handle `REQUEST` messages, however as you can see, it’s trivial now to handle new cases in the future as needed.

## Introduced Tunnel Message Protocol

Now that we’ve seen the mechanics of how messaging is handled, let’s go through the messaging protocol itself and how messages are represented.

Currently the protocol is quite basic, it consists of 3 components: 1. Message type prefix, 2. Length of message data bytes and 3. The actual data bytes of the message. They are delimited by a new line character `\n`. It looks something like this:

```
REQUEST
110
[23 25 52 38 95 39 ...]
```

This represents a **request** message. 

```
CLIENT_DISCONNECT
0
[]
```

This represents a **client disconnect** message. 

You get the idea. Whenever I need to introduce a new type of message either from the client or the server, I can just add it to the protocol. Here’s how the code looks like for defining the messages:

```go
const (
	HEARTBEAT = iota + 1
	REQUEST
	RESPONSE
	CLIENT_DISCONNECT
	LOCALHOST_NOT_RUNNING
)

var MESSAGE_MAPPING = map[int]string{
	HEARTBEAT:             "HEARTBEAT",
	REQUEST:               "REQUEST",
	RESPONSE:              "RESPONSE",
	CLIENT_DISCONNECT:     "CLIENT_DISCONNECT",
	LOCALHOST_NOT_RUNNING: "LOCALHOST_NOT_RUNNING",
}

type TunnelMessage struct {
	msgType int
	msgData []byte
}
```

To serialize and deserialize the message in the format described above, I added serializer/deserializer functions to the `TunnelMessage` struct:

### Serializing Messages

```go
func (tm *TunnelMessage) serializeMessage() ([]byte, error) {
	serializedMsg := [][]byte{}

	// Determine message type to add prefix
	msgType := MESSAGE_MAPPING[tm.msgType]
	if msgType == "" {
		log.Fatalf("Invalid TunnelMessage type: %v:", tm.msgType)
	}

	// Add the message type
	serializedMsg = append(serializedMsg, []byte(msgType))
	// Add message data bytes length
	serializedMsg = append(serializedMsg, []byte(strconv.Itoa(len(tm.msgData))))
	// Add the message data
	serializedMsg = append(serializedMsg, tm.msgData)

	// Combine all the data separated by new lines
	return bytes.Join(serializedMsg, []byte("\n")), nil
}
```

### Deserializing Messages

```go
func (tm *TunnelMessage) readMessageData(length int, reader *bufio.Reader) []byte {
	msgData := make([]byte, length)

	if _, err := io.ReadFull(reader, msgData); err != nil {
		log.Fatalf("Failed to read all Msg Data: %v", err)
	}

	return msgData
}

func (tm *TunnelMessage) deserializeMessage(reader *bufio.Reader) error {
	msgPrefix, err := reader.ReadString('\n')
	if err != nil {
		return err
	}

	msgLengthStr, err := reader.ReadString('\n')
	if err != nil {
		return err
	}

	msgLength, err := strconv.Atoi(msgLengthStr[:len(msgLengthStr)-1])
	if err != nil {
		log.Fatalf("Could not parse message length: %v", msgLengthStr)
	}

	var msgType int
	msgData := tm.readMessageData(msgLength, reader)

	switch msgPrefix {
	case "HEARTBEAT\n":
		msgType = HEARTBEAT
	case "REQUEST\n":
		msgType = REQUEST
	case "RESPONSE\n":
		msgType = RESPONSE
	case "CLIENT_DISCONNECT\n":
		msgType = CLIENT_DISCONNECT
	case "LOCALHOST_NOT_RUNNING\n":
		msgType = LOCALHOST_NOT_RUNNING
	default:
		log.Fatalf("Invalid TunnelMessage prefix: %v", msgPrefix)
	}

	tm.msgType = msgType
	tm.msgData = msgData

	return nil
}
```

### Sending/Receiving Messages

Once we have serializing/deserializing implemented, sending/receiving messages becomes trivial:

```go
func (t *Tunnel) sendMessage(tunnelMsg TunnelMessage) error {
	// Serialize tunnel message data
	serializedMsg, serializeErr := tunnelMsg.serializeMessage()
	if serializeErr != nil {
		return serializeErr
	}
	_, err := t.conn.Write(serializedMsg)
	return err
}

func (t *Tunnel) receiveMessage() (TunnelMessage, error) {
	msgReader := bufio.NewReader(t.conn)

	// Read and deserialize tunnel message data
	tunnelMessage := TunnelMessage{}
	deserializeErr := tunnelMessage.deserializeMessage(msgReader)

	return tunnelMessage, deserializeErr
}
```

### Thoughts on Optimizing

As you’ve seen, the protocol is quite simple. The message type (prefix) is represented as a string, and that string differs in length for different message types. That is an awful lot of space to just represent the type of the message, 7 bytes in the case of `REQUEST`.

A better approach would be to use a single byte (8-bits), which gives us the possibility to represent (2<sup>8</sup>) 256 different types of values, which I’d like to assume would be more than enough to represent all the possible different types of messages in the protocol between the server and client.

The currently implementation is fine for now, however I will likely revisit it soon to optimize it.

## Handled Various Actions/Edge Cases

The last thing I wanted to mention that I worked on was handling various cases that could occur in the lifecycle of `mmar server` or `mmar client`. This included scenarios like:

- Server handling when a client disconnects
- Client handling when the server disconnects
- Gracefully handling shutdown of client
- Gracefully handling shutdown of the server
- What happens when both the server and client are up, running and connected, but nothing is running locally to expose?

Basically the changes included improvements to the stability of both the server and client. In addition to making sure to shutdown unused resources (such as goroutines) if they are no longer needed, eg when a client disconnects, we no longer need the goroutine to process messages from it.

## Thanks!

That’s it for this edition of the devlog, hope you enjoyed reading it. Now back to building, see you in the next one!
