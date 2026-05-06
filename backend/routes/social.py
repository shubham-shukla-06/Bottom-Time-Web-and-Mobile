from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from datetime import datetime, timezone
from typing import Optional
from database import db
from config import JWT_SECRET, ALGORITHM
from models import GroupThreadCreate, MessageSend
from auth_utils import get_current_user
from helpers import create_notification
import uuid
import json

router = APIRouter()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self) -> dict:
        self.active: dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> dict:
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str) -> dict:
        self.active.pop(user_id, None)

    async def send_to_user(self, user_id: str, data: dict) -> dict:
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

ws_manager = ConnectionManager()


@router.websocket("/ws/messages")
async def websocket_messages(ws: WebSocket, token: str = Query("")):
    user_id = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await ws.close(code=4001)
            return
    except JWTError:
        await ws.close(code=4001)
        return

    await ws_manager.connect(user_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
            elif msg.get("type") == "typing":
                # Broadcast typing indicator to the other party
                thread_id = msg.get("thread_id", "")
                if thread_id.startswith("group_"):
                    thread = await db.threads.find_one({"id": thread_id}, {"_id": 0, "participant_ids": 1})
                    if thread:
                        for pid in thread.get("participant_ids", []):
                            if pid != user_id:
                                await ws_manager.send_to_user(pid, {"type": "typing", "thread_id": thread_id, "user_id": user_id, "user_name": msg.get("user_name", "")})
                elif "_" in thread_id:
                    parts = thread_id.split("_")
                    other_id = parts[1] if parts[0] == user_id else parts[0]
                    await ws_manager.send_to_user(other_id, {"type": "typing", "thread_id": thread_id, "user_id": user_id, "user_name": msg.get("user_name", "")})
            elif msg.get("type") == "stop_typing":
                thread_id = msg.get("thread_id", "")
                if thread_id.startswith("group_"):
                    thread = await db.threads.find_one({"id": thread_id}, {"_id": 0, "participant_ids": 1})
                    if thread:
                        for pid in thread.get("participant_ids", []):
                            if pid != user_id:
                                await ws_manager.send_to_user(pid, {"type": "stop_typing", "thread_id": thread_id, "user_id": user_id})
                elif "_" in thread_id:
                    parts = thread_id.split("_")
                    other_id = parts[1] if parts[0] == user_id else parts[0]
                    await ws_manager.send_to_user(other_id, {"type": "stop_typing", "thread_id": thread_id, "user_id": user_id})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        ws_manager.disconnect(user_id)


@router.get("/community/profiles")
async def get_community_profiles(
    current_user: dict = Depends(get_current_user),
    country: Optional[str] = Query(None),
    experience: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100)
):
    my_connections = await db.connections.find(
        {"$or": [{"from_id": current_user["id"]}, {"to_id": current_user["id"]}], "status": "accepted"},
        {"from_id": 1, "to_id": 1}
    ).to_list(1000)
    connected_ids = set()
    for c in my_connections:
        connected_ids.add(c["from_id"])
        connected_ids.add(c["to_id"])
    connected_ids.discard(current_user["id"])
    query = {"role": "diver", "onboarding_complete": True, "id": {"$ne": current_user["id"], "$nin": list(connected_ids)}}
    if country:
        query["location_country"] = {"$regex": country, "$options": "i"}
    if experience:
        query["experience_level"] = experience
    users = await db.users.find(query, {"_id": 0, "phone": 0, "email": 0}).skip(skip).limit(limit).to_list(limit)
    return {"profiles": users}


@router.post("/community/connect/{user_id}")
async def send_connection(user_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.connections.find_one({"$or": [
        {"from_id": current_user["id"], "to_id": user_id},
        {"from_id": user_id, "to_id": current_user["id"]}
    ]})
    if existing:
        raise HTTPException(status_code=400, detail="Already connected")
    conn = {
        "id": str(uuid.uuid4()),
        "from_id": current_user["id"],
        "from_name": current_user["name"],
        "to_id": user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.connections.insert_one(conn.copy())
    await create_notification(user_id, "connection_request", "New Connection Request", f"{current_user['name']} wants to connect with you", {"from_user_id": current_user["id"], "from_name": current_user["name"]})
    return {"message": "Request sent!"}


@router.delete("/community/connect/{user_id}")
async def remove_connection(user_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.connections.delete_one({"$or": [
        {"from_id": current_user["id"], "to_id": user_id},
        {"from_id": user_id, "to_id": current_user["id"]}
    ]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"message": "Disconnected"}


@router.get("/community/connections")
async def get_my_connections(current_user: dict = Depends(get_current_user)):
    pending = await db.connections.find({"to_id": current_user["id"], "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for p in pending:
        sender = await db.users.find_one({"id": p["from_id"]}, {"_id": 0, "phone": 0, "email": 0})
        p["buddy"] = sender
    accepted = await db.connections.find(
        {"$or": [{"from_id": current_user["id"]}, {"to_id": current_user["id"]}], "status": "accepted"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    buddies = []
    for c in accepted:
        other_id = c["to_id"] if c["from_id"] == current_user["id"] else c["from_id"]
        other = await db.users.find_one({"id": other_id}, {"_id": 0, "phone": 0, "email": 0})
        if other:
            buddies.append({**c, "buddy": other})
    sent = await db.connections.find({"from_id": current_user["id"], "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for s in sent:
        recipient = await db.users.find_one({"id": s["to_id"]}, {"_id": 0, "phone": 0, "email": 0})
        s["buddy"] = recipient
    sent_ids = [s["to_id"] for s in sent]
    return {"pending": pending, "buddies": buddies, "sent": sent, "sent_ids": sent_ids}


@router.put("/community/connections/{connection_id}")
async def respond_connection(connection_id: str, action: str = Query(...), current_user: dict = Depends(get_current_user)):
    if action not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="Must be accept or reject")
    conn = await db.connections.find_one({"id": connection_id, "to_id": current_user["id"]})
    if not conn:
        raise HTTPException(status_code=404, detail="Request not found")
    if action == "accept":
        await db.connections.update_one({"id": connection_id}, {"$set": {"status": "accepted"}})
        await create_notification(conn["from_id"], "connection_accepted", "Connection Accepted", f"{current_user['name']} accepted your connection request", {"user_id": current_user["id"], "user_name": current_user["name"]})
    else:
        await db.connections.delete_one({"id": connection_id})
    return {"message": f"Request {action}ed"}


@router.get("/events")
async def get_events(
    location: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50)
):
    query = {"status": "active"}
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if event_type:
        query["event_type"] = event_type
    total = await db.events.count_documents(query)
    events = await db.events.find(query, {"_id": 0}).sort("date", 1).skip(skip).limit(limit).to_list(limit)
    return {"events": events, "total": total, "has_more": skip + len(events) < total}


@router.post("/events/{event_id}/rsvp")
async def rsvp_event(event_id: str, current_user: dict = Depends(get_current_user)):
    event = await db.events.find_one({"id": event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if current_user["id"] in event.get("attendees", []):
        await db.events.update_one({"id": event_id}, {"$pull": {"attendees": current_user["id"]}})
        return {"message": "RSVP removed", "attending": False}
    await db.events.update_one({"id": event_id}, {"$addToSet": {"attendees": current_user["id"]}})
    return {"message": "RSVP confirmed", "attending": True}


@router.post("/messages/group-thread")
async def create_group_thread(data: GroupThreadCreate, current_user: dict = Depends(get_current_user)):
    if len(data.participant_ids) < 2:
        raise HTTPException(status_code=400, detail="Group needs at least 2 other members")
    all_ids = list(set([current_user["id"]] + data.participant_ids))
    participants = []
    for uid in all_ids:
        u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1})
        if u:
            participants.append(u)
    group_name = data.name or ", ".join(p["name"] for p in participants if p["id"] != current_user["id"])
    thread = {
        "id": f"group_{uuid.uuid4().hex[:12]}",
        "type": "group",
        "name": group_name,
        "participant_ids": [p["id"] for p in participants],
        "participants": participants,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.threads.insert_one(thread.copy())
    return {"thread_id": thread["id"], "name": group_name, "participants": participants, "type": "group"}


@router.post("/messages")
async def send_message(data: MessageSend, current_user: dict = Depends(get_current_user)):
    if data.thread_id and data.thread_id.startswith("group_"):
        thread = await db.threads.find_one({"id": data.thread_id}, {"_id": 0})
        if not thread or current_user["id"] not in thread.get("participant_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this group")
        msg = {"id": str(uuid.uuid4()), "thread_id": data.thread_id, "from_id": current_user["id"], "from_name": current_user["name"], "content": data.content, "read_by": [current_user["id"]], "created_at": datetime.now(timezone.utc).isoformat()}
        await db.messages.insert_one(msg.copy())
        # Notify group members via WebSocket
        for pid in thread.get("participant_ids", []):
            if pid != current_user["id"]:
                await ws_manager.send_to_user(pid, {"type": "new_message", "message": msg, "thread_id": data.thread_id})
        return msg
    to_id = data.to_id
    if not to_id:
        if data.thread_id and "_" in data.thread_id:
            parts = data.thread_id.split("_")
            to_id = parts[1] if parts[0] == current_user["id"] else parts[0]
        else:
            raise HTTPException(status_code=400, detail="to_id or thread_id required")
    thread_ids = sorted([current_user["id"], to_id])
    thread_id = f"{thread_ids[0]}_{thread_ids[1]}"
    msg = {"id": str(uuid.uuid4()), "thread_id": thread_id, "from_id": current_user["id"], "from_name": current_user["name"], "to_id": to_id, "content": data.content, "booking_id": data.booking_id, "read": False, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.messages.insert_one(msg.copy())
    preview = data.content[:50] + ("..." if len(data.content) > 50 else "")
    await create_notification(to_id, "new_message", "New Message", f"{current_user['name']}: {preview}", {"thread_id": thread_id, "from_name": current_user["name"]})
    # Notify recipient via WebSocket
    await ws_manager.send_to_user(to_id, {"type": "new_message", "message": msg, "thread_id": thread_id})
    return msg


@router.get("/messages/threads")
async def get_threads(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    pipeline = [
        {"$match": {"$or": [{"from_id": uid}, {"to_id": uid}], "thread_id": {"$not": {"$regex": "^group_"}}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$thread_id", "last_message": {"$first": "$$ROOT"}, "unread": {"$sum": {"$cond": [{"$and": [{"$eq": ["$to_id", uid]}, {"$eq": ["$read", False]}]}, 1, 0]}}}},
        {"$sort": {"last_message.created_at": -1}}
    ]
    dm_threads = await db.messages.aggregate(pipeline).to_list(50)
    result = []
    for t in dm_threads:
        lm = t["last_message"]
        other_id = lm["to_id"] if lm["from_id"] == uid else lm["from_id"]
        other_user = await db.users.find_one({"id": other_id}, {"_id": 0, "phone": 0, "email": 0})
        result.append({"thread_id": t["_id"], "type": "direct", "other_user": other_user, "last_message": lm.get("content", ""), "last_time": lm.get("created_at"), "unread": t["unread"]})
    group_threads = await db.threads.find({"type": "group", "participant_ids": uid}, {"_id": 0}).to_list(50)
    for gt in group_threads:
        last_msg = await db.messages.find({"thread_id": gt["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1)
        unread = await db.messages.count_documents({"thread_id": gt["id"], "read_by": {"$nin": [uid]}})
        result.append({
            "thread_id": gt["id"], "type": "group",
            "name": gt.get("name", "Group"),
            "participants": gt.get("participants", []),
            "last_message": last_msg[0].get("content", "") if last_msg else "",
            "last_time": last_msg[0].get("created_at") if last_msg else gt.get("created_at"),
            "unread": unread
        })
    result.sort(key=lambda x: x.get("last_time") or "", reverse=True)
    return {"threads": result}


@router.get("/messages/thread-with/{user_id}")
async def get_or_create_thread(user_id: str, current_user: dict = Depends(get_current_user)):
    thread_ids = sorted([current_user["id"], user_id])
    thread_id = f"{thread_ids[0]}_{thread_ids[1]}"
    other_user = await db.users.find_one({"id": user_id}, {"_id": 0, "phone": 0, "email": 0})
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"thread_id": thread_id, "other_user": other_user, "type": "direct"}


@router.get("/messages/thread-info/{thread_id}")
async def get_thread_info(thread_id: str, current_user: dict = Depends(get_current_user)):
    if thread_id.startswith("group_"):
        thread = await db.threads.find_one({"id": thread_id}, {"_id": 0})
        if not thread or current_user["id"] not in thread.get("participant_ids", []):
            raise HTTPException(status_code=403, detail="Not a member")
        return {"thread_id": thread_id, "type": "group", "name": thread.get("name"), "participants": thread.get("participants", [])}
    raise HTTPException(status_code=400, detail="Use thread-with for direct threads")


@router.get("/messages/{thread_id}")
async def get_messages(thread_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    if thread_id.startswith("group_"):
        thread = await db.threads.find_one({"id": thread_id}, {"_id": 0})
        if not thread or uid not in thread.get("participant_ids", []):
            raise HTTPException(status_code=403, detail="Not a member of this group")
        msgs = await db.messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
        unread_ids = [m["id"] for m in msgs if uid not in m.get("read_by", [])]
        if unread_ids:
            await db.messages.update_many({"thread_id": thread_id, "read_by": {"$nin": [uid]}}, {"$addToSet": {"read_by": uid}})
            # Broadcast read receipt to message senders
            senders = set(m["from_id"] for m in msgs if m["id"] in unread_ids and m["from_id"] != uid)
            for sender_id in senders:
                await ws_manager.send_to_user(sender_id, {"type": "read_receipt", "thread_id": thread_id, "reader_id": uid, "message_ids": unread_ids})
        return {"messages": msgs, "type": "group", "participants": thread.get("participants", [])}
    msgs = await db.messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    unread_msgs = [m for m in msgs if m.get("to_id") == uid and not m.get("read")]
    if unread_msgs:
        unread_ids = [m["id"] for m in unread_msgs]
        await db.messages.update_many({"thread_id": thread_id, "to_id": uid, "read": False}, {"$set": {"read": True}})
        # Broadcast read receipt to the sender
        senders = set(m["from_id"] for m in unread_msgs)
        for sender_id in senders:
            await ws_manager.send_to_user(sender_id, {"type": "read_receipt", "thread_id": thread_id, "reader_id": uid, "message_ids": unread_ids})
    return {"messages": msgs, "type": "direct"}
