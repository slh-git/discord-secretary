# Handoff (Simple Version)

## What Are We Building?

A central backend platform that contains all business logic.

Different interfaces connect to it:

```text
Discord
Web
Mobile
Future Apps
```

All interfaces use the same backend.

Goal:

```text
Write logic once
Use it everywhere
```

Example:

```text
User creates task in Discord

Task immediately exists for:
- Web App
- Mobile App
- Future Integrations
```

because everything talks to the same backend.

---

# Simple Mental Model

Think of the backend as a game engine.

```text
Game Engine
    ↑
Controllers
Keyboard
Mouse
Gamepad
```

The controllers are different.

The engine is shared.

Our architecture:

```text
Backend
    ↑
Discord
Web
Mobile
```

---

# Why We Do NOT Want Business Logic In Clients

Bad:

```text
Discord knows how tasks work

Web knows how tasks work

Mobile knows how tasks work
```

Now every app duplicates logic.

Changing behavior means updating:

* Discord
* Web
* Mobile

Good:

```text
Backend knows how tasks work
```

Clients only send requests.

---

# Architecture

```text
Client
   ↓
API
   ↓
Service
   ↓
Database
```

Example:

```text
Discord
   ↓
POST /task
   ↓
Task Service
   ↓
Database
```

Simple.

---

# What Is A Service?

A service owns business logic.

Examples:

```text
User Service
Task Service
Message Service
Permission Service
```

Example:

```ts
taskService.createTask()
```

The service:

* validates input
* applies business rules
* saves data
* emits events

The service owns the operation.

---

# Why We Use Events

When something important happens:

```text
Task Created
User Registered
Message Received
```

the service emits an event.

Example:

```ts
eventBus.emit(
  "task.created",
  task
)
```

The service does not care who listens.

This keeps the system loosely coupled.

---

# What Is An Event?

An event is simply:

```text
Something happened
```

Examples:

```text
user.created
task.created
task.completed
message.received
permission.updated
```

Events are facts.

Not requests.

---

# Why Plugins Exist

We want to add functionality later without modifying core services.

Example:

Core service:

```text
Task Created
```

Plugin A:

```text
Send Discord Notification
```

Plugin B:

```text
Create Analytics Record
```

Plugin C:

```text
Schedule Reminder
```

The task service knows nothing about those plugins.

---

# Event Flow

```text
Task Service
     ↓
 task.created
     ↓
 Event Bus
     ↓
 ├── Notification Plugin
 ├── Analytics Plugin
 └── Reminder Plugin
```

Services publish events.

Plugins subscribe to events.

---

# Example

Task Service:

```ts
async function createTask(task) {
  await db.tasks.create(task)

  eventBus.emit(
    "task.created",
    task
  )
}
```

Plugin:

```ts
eventBus.on(
  "task.created",
  async (task) => {
    sendNotification(task)
  }
)
```

---

# Current Domains

Keep the core small.

Core domains:

```text
users/
permissions/
messages/
plugins/
```

Potential future domains:

```text
tasks/
ai/
workflows/
knowledge/
```

Only add domains when they become important.

---

# Current Folder Structure

```text
src/

api/

users/
permissions/
messages/

plugins/

events/
  event-bus.ts

database/
```

---

# Technology Stack

Backend:

```text
TypeScript
Fastify
```

Frontend:

```text
Next.js
```

Mobile:

```text
React Native / Expo
```

Database:

```text
PostgreSQL
```

Optional:

```text
Redis
```

Deployment:

```text
Docker Compose
```

---

# Things We Intentionally Avoid

Not because they are bad.

Because they are unnecessary right now.

Avoid:

```text
Microservices
Kafka
RabbitMQ
CQRS
Command Bus
Event Sourcing
Kubernetes
Plugin Marketplace
```

Reason:

```text
More complexity
Little benefit
```

for Version 1.

---

# Growth Path

Version 1:

```text
Fastify
Services
PostgreSQL
Event Bus
Plugins
Discord
```

Version 2:

```text
Web App
Mobile App
Redis
```

Version 3:

```text
Notifications
Scheduling
Background Jobs
```

Version 4:

```text
Advanced Plugin System
External Integrations
Distributed Workers
```

Only add complexity when a real need appears.

---

# Final Architecture

```text
Discord
Web
Mobile
      ↓
    Fastify
      ↓
   Services
      ↓
 PostgreSQL

   Services
      ↓
   Event Bus
      ↓
    Plugins
```

---

# Suggested Skills

Future agent should be comfortable with:

* TypeScript
* Fastify
* Next.js
* React Native
* PostgreSQL
* Docker Compose
* Event-driven architecture
* Plugin architecture
* REST APIs
* Authentication / Authorization
* Software architecture

Avoid recommending enterprise patterns unless a real scaling problem appears.

---

# One Sentence Summary

Build a simple backend where services own business logic, emit events when important things happen, and plugins subscribe to those events while Discord, web, and mobile remain thin clients.
