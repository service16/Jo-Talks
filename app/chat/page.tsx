'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { Send, UserPlus, Check, X, ShieldAlert, LogOut, Search } from 'lucide-react'

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
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
        fetchFriends(user.id)
        fetchPendingRequests(user.id)
      }
    })
  }, [])

  // Fetch accepted friends
  const fetchFriends = async (userId: string) => {
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        user_id,
        friend_id,
        status
      `)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted')

    if (data) {
      const friendIds = data.map(f => f.user_id === userId ? f.friend_id : f.user_id)
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', friendIds)
        setFriends(profiles || [])
      } else {
        setFriends([])
      }
    }
  }

  // Fetch pending requests
  const fetchPendingRequests = async (userId: string) => {
    const { data } = await supabase
      .from('friendships')
      .select('id, user_id')
      .eq('friend_id', userId)
      .eq('status', 'pending')

    if (data && data.length > 0) {
      const senderIds = data.map(f => f.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', senderIds)
      setPendingRequests(profiles || [])
    }
  }

  // Search usernames
  const searchUsers = async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${query}%`)
      .limit(5)

    if (data) {
      setSearchResults(data.filter(u => u.id !== user?.id))
    }
  }

  // Send friend request
  const sendFriendRequest = async (friendId: string) => {
    const { error } = await supabase.from('friendships').insert({
      user_id: user.id,
      friend_id: friendId,
      status: 'pending'
    })
    if (error) alert(error.message)
    else alert('Friend request sent!')
  }

  // Accept friend request
  const acceptRequest = async (senderId: string) => {
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('user_id', senderId)
      .eq('friend_id', user.id)

    fetchFriends(user.id)
    setPendingRequests(pendingRequests.filter(p => p.id !== senderId))
  }

  // Load messages when a friend is selected
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

    // Real-time subscription for new messages
    const channel = supabase
      .channel('realtime-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new
          if (
            (newMsg.sender_id === user.id && newMsg.receiver_id === selectedFriend.id) ||
            (newMsg.sender_id === selectedFriend.id && newMsg.receiver_id === user.id)
          ) {
            setMessages((prev) => [...prev, newMsg])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedFriend, user])

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedFriend) return

    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: selectedFriend.id,
      content: newMessage,
    })

    if (!error) {
      setNewMessage('')
    }
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-950">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className="font-bold text-indigo-400 truncate text-sm">@{user?.user_metadata?.username || 'User'}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-gray-400 hover:text-red-400">
            <LogOut size={18} />
          </button>
        </div>

        {/* Username Search */}
        <div className="p-3 border-b border-gray-800 relative">
          <div className="flex items-center bg-gray-900 rounded px-3 py-1.5 border border-gray-800">
            <Search size={16} className="text-gray-500 mr-2" />
            <input 
              type="text" 
              placeholder="Search username to add..." 
              value={searchQuery}
              onChange={(e) => searchUsers(e.target.value)}
              className="bg-transparent focus:outline-none text-xs w-full text-white"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-3 right-3 mt-1 bg-gray-900 border border-gray-800 rounded shadow-lg z-10">
              {searchResults.map((profile) => (
                <div key={profile.id} className="flex items-center justify-between p-2 hover:bg-gray-800 border-b border-gray-800 last:border-none">
                  <span className="text-xs font-medium">@{profile.username}</span>
                  <button 
                    onClick={() => sendFriendRequest(profile.id)}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] rounded"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Requests Section */}
        {pendingRequests.length > 0 && (
          <div className="p-3 border-b border-gray-800 bg-gray-900/50">
            <h4 className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">Pending Requests</h4>
            {pendingRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between text-xs mb-1">
                <span>@{req.username}</span>
                <button onClick={() => acceptRequest(req.id)} className="p-1 bg-green-600 rounded hover:bg-green-500">
                  <Check size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Friends List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Friends</h3>
          {friends.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No friends yet. Search usernames above!</p>
          ) : (
            friends.map(friend => (
              <div 
                key={friend.id}
                onClick={() => setSelectedFriend(friend)}
                className={`flex items-center p-2 rounded cursor-pointer transition ${selectedFriend?.id === friend.id ? 'bg-indigo-600/20 border border-indigo-500/50' : 'hover:bg-gray-900'}`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-xs mr-2">
                  {friend.username?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-medium">@{friend.username}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedFriend ? (
          <>
            <div className="h-16 border-b border-gray-800 flex items-center px-6 bg-gray-950">
              <h2 className="font-semibold text-base">Chat with @{selectedFriend.username}</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => {
                const isMe = msg.sender_id === user.id
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg text-sm ${isMe ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                      {msg.content}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-gray-800 bg-gray-950 flex gap-2">
              <input 
                type="text" 
                placeholder="Type a message..." 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded text-sm font-medium flex items-center">
                <Send size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Select a friend from the sidebar to start chatting.
          </div>
        )}
      </div>
    </div>
  )
}
