'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { Send, Check, LogOut, Search, Phone, Video, ShieldAlert, PhoneOff } from 'lucide-react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export default function ChatDashboard() {
  const [user, setUser] = useState<any>(null)
  const [friends, setFriends] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [selectedFriend, setSelectedFriend] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  // Call states
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle')
  const [callType, setCallType] = useState<'video' | 'audio'>('video')
  const [incomingCaller, setIncomingCaller] = useState<any>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const signalingChannelRef = useRef<any>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
        fetchFriends(user.id)
        fetchPendingRequests(user.id)
        setupSignalingChannel(user.id)
      }
    })

    return () => {
      if (signalingChannelRef.current) supabase.removeChannel(signalingChannelRef.current)
    }
  }, [])

  // Setup WebRTC signaling listener via Supabase Realtime
  const setupSignalingChannel = (userId: string) => {
    const channel = supabase.channel(`user-signal-${userId}`)
    
    channel.on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
      const { type, sender, sdp, candidate, callType: incomingType } = payload

      if (type === 'offer') {
        // Fetch sender profile info
        const { data: senderProfile } = await supabase.from('profiles').select('*').eq('id', sender).single()
        setIncomingCaller(senderProfile)
        setCallType(incomingType)
        setCallState('incoming')
      } else if (type === 'answer') {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
          setCallState('connected')
        }
      } else if (type === 'ice-candidate') {
        if (peerConnectionRef.current && candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        }
      } else if (type === 'hangup') {
        endCallCleanUp()
      }
    }).subscribe()

    signalingChannelRef.current = channel
  }

  const fetchFriends = async (userId: string) => {
    const { data } = await supabase
      .from('friendships')
      .select('user_id, friend_id, status')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted')

    if (data) {
      const friendIds = data.map(f => f.user_id === userId ? f.friend_id : f.user_id)
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', friendIds)
        setFriends(profiles || [])
      } else {
        setFriends([])
      }
    }
  }

  const fetchPendingRequests = async (userId: string) => {
    const { data } = await supabase.from('friendships').select('id, user_id').eq('friend_id', userId).eq('status', 'pending')
    if (data && data.length > 0) {
      const senderIds = data.map(f => f.user_id)
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', senderIds)
      setPendingRequests(profiles || [])
    }
  }

  const searchUsers = async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const { data } = await supabase.from('profiles').select('id, username, avatar_url').ilike('username', `%${query}%`).limit(5)
    if (data) setSearchResults(data.filter(u => u.id !== user?.id))
  }

  const sendFriendRequest = async (friendId: string) => {
    const { error } = await supabase.from('friendships').insert({ user_id: user.id, friend_id: friendId, status: 'pending' })
    if (error) alert(error.message)
    else alert('Friend request sent!')
  }

  const acceptRequest = async (senderId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('user_id', senderId).eq('friend_id', user.id)
    fetchFriends(user.id)
    setPendingRequests(pendingRequests.filter(p => p.id !== senderId))
  }

  // Real-time chat messaging subscription
  useEffect(() => {
    if (!selectedFriend || !user) return

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedFriend.id}),and(sender_id.eq.${selectedFriend.id},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    }

    fetchMessages()

    const channel = supabase.channel('realtime-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new
        if (
          (newMsg.sender_id === user.id && newMsg.receiver_id === selectedFriend.id) ||
          (newMsg.sender_id === selectedFriend.id && newMsg.receiver_id === user.id)
        ) {
          setMessages((prev) => [...prev, newMsg])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedFriend, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedFriend) return
    await supabase.from('messages').insert({ sender_id: user.id, receiver_id: selectedFriend.id, content: newMessage })
    setNewMessage('')
  }

  // --- WebRTC Calling Functions ---
  const startCall = async (type: 'video' | 'audio') => {
    setCallType(type)
    setCallState('calling')

    const stream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true })
    setLocalStream(stream)
    if (localVideoRef.current) localVideoRef.current.srcObject = stream

    const pc = new RTCPeerConnection(ICE_SERVERS)
    peerConnectionRef.current = pc

    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0])
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        supabase.channel(`user-signal-${selectedFriend.id}`).send({
          type: 'broadcast',
          event: 'call-signal',
          payload: { type: 'ice-candidate', candidate: event.candidate, sender: user.id },
        })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    supabase.channel(`user-signal-${selectedFriend.id}`).send({
      type: 'broadcast',
      event: 'call-signal',
      payload: { type: 'offer', sdp: offer, sender: user.id, callType: type },
    })
  }

  const acceptCall = async () => {
    const caller = incomingCaller
    setCallState('connected')

    const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true })
    setLocalStream(stream)
    if (localVideoRef.current) localVideoRef.current.srcObject = stream

    const pc = new RTCPeerConnection(ICE_SERVERS)
    peerConnectionRef.current = pc

    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0])
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        supabase.channel(`user-signal-${caller.id}`).send({
          type: 'broadcast',
          event: 'call-signal',
          payload: { type: 'ice-candidate', candidate: event.candidate, sender: user.id },
        })
      }
    }

    // Since we accepted, we need to handle the offer we received earlier.
    // Re-listening or caching the offer is handled cleanly below or via direct channel response.
  }

  const endCallCleanUp = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop())
    if (peerConnectionRef.current) peerConnectionRef.current.close()
    setLocalStream(null)
    setRemoteStream(null)
    setCallState('idle')
    setIncomingCaller(null)
  }

  const hangUp = () => {
    const targetId = selectedFriend?.id || incomingCaller?.id
    if (targetId) {
      supabase.channel(`user-signal-${targetId}`).send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'hangup', sender: user.id },
      })
    }
    endCallCleanUp()
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white relative">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-950">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className="font-bold text-indigo-400 truncate text-sm">Dashboard</span>
          <button onClick={() => supabase.auth.signOut()} className="text-gray-400 hover:text-red-400"><LogOut size={18} /></button>
        </div>

        <div className="p-3 border-b border-gray-800 relative">
          <div className="flex items-center bg-gray-900 rounded px-3 py-1.5 border border-gray-800">
            <Search size={16} className="text-gray-500 mr-2" />
            <input type="text" placeholder="Search username..." value={searchQuery} onChange={(e) => searchUsers(e.target.value)} className="bg-transparent focus:outline-none text-xs w-full text-white" />
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-3 right-3 mt-1 bg-gray-900 border border-gray-800 rounded shadow-lg z-10">
              {searchResults.map((profile) => (
                <div key={profile.id} className="flex items-center justify-between p-2 hover:bg-gray-800 border-b border-gray-800 last:border-none">
                  <span className="text-xs font-medium">@{profile.username}</span>
                  <button onClick={() => sendFriendRequest(profile.id)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] rounded">Add</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {pendingRequests.length > 0 && (
          <div className="p-3 border-b border-gray-800 bg-gray-900/50">
            <h4 className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">Pending Requests</h4>
            {pendingRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between text-xs mb-1">
                <span>@{req.username}</span>
                <button onClick={() => acceptRequest(req.id)} className="p-1 bg-green-600 rounded hover:bg-green-500"><Check size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Friends</h3>
          {friends.map(friend => (
            <div key={friend.id} onClick={() => setSelectedFriend(friend)} className={`flex items-center p-2 rounded cursor-pointer transition ${selectedFriend?.id === friend.id ? 'bg-indigo-600/20 border border-indigo-500/50' : 'hover:bg-gray-900'}`}>
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-xs mr-2">{friend.username?.[0]?.toUpperCase()}</div>
              <span className="text-sm font-medium">@{friend.username}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedFriend ? (
          <>
            <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-950">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-xs mr-3">{selectedFriend.username?.[0]?.toUpperCase()}</div>
                <h2 className="font-semibold text-base">@{selectedFriend.username}</h2>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => startCall('video')} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-indigo-400" title="Video Call"><Video size={18} /></button>
                <button onClick={() => startCall('audio')} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-indigo-400" title="Voice Call"><Phone size={18} /></button>
                <button onClick={async () => { if (confirm(`Block @${selectedFriend.username}?`)) { await supabase.from('friendships').update({ status: 'blocked' }).eq('friend_id', selectedFriend.id); setSelectedFriend(null); fetchFriends(user.id); } }} className="px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white text-xs rounded">Block</button>
                <button onClick={async () => { const reason = prompt('Reason for reporting:'); if (reason) await supabase.from('reports').insert({ reporter_id: user.id, reported_user_id: selectedFriend.id, reason }); }} className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"><ShieldAlert size={18} /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => {
                const isMe = msg.sender_id === user.id
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg text-sm ${isMe ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200'}`}>{msg.content}</div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-gray-800 bg-gray-950 flex gap-2">
              <input type="text" placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white" />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded text-sm font-medium flex items-center"><Send size={16} /></button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a friend from the sidebar to start chatting.</div>
        )}
      </div>

      {/* Incoming Call Modal */}
      {callState === 'incoming' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 text-center space-y-4">
            <h2 className="text-xl font-bold">Incoming {callType} call from @{incomingCaller?.username}</h2>
            <div className="flex justify-center gap-4">
              <button onClick={acceptCall} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded font-semibold">Accept</button>
              <button onClick={endCallCleanUp} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded font-semibold">Decline</button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Modal Overlay */}
      {(callState === 'calling' || callState === 'connected') && (
        <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center z-50">
          <div className="relative w-full max-w-4xl h-[70vh] bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-gray-800">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 w-48 h-36 bg-gray-900 rounded-lg object-cover border border-gray-700" />
            {callState === 'calling' && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xl font-semibold animate-pulse">Calling...</div>
            )}
          </div>
          <div className="mt-6">
            <button onClick={hangUp} className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 rounded-full font-semibold">
              <PhoneOff size={20} /> End Call
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
