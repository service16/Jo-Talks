'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Save, User as UserIcon } from 'lucide-react'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [tag, setTag] = useState('')
  const [statusText, setStatusText] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
        fetchProfile(user.id)
      } else {
        router.push('/login')
      }
    })
  }, [router])

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setUsername(data.username || '')
      setTag(data.tag || '')
      setStatusText(data.status_text || '')
      setAvatarUrl(data.avatar_url || '')
    }
  }

  // Handle image upload to Supabase storage bucket
  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true)
      if (!e.target.files || e.target.files.length === 0) return

      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      // Upload file to 'avatars' storage bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get public URL of the uploaded image
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const publicUrl = data.publicUrl

      setAvatarUrl(publicUrl)

      // Save public URL immediately to profile
      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      alert('Avatar uploaded successfully!')
    } catch (error: any) {
      alert('Error uploading avatar: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  // Save profile updates (status text, tag, username)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        tag,
        status_text: statusText,
      })
      .eq('id', user.id)

    if (error) {
      alert(error.message)
    } else {
      alert('Profile updated successfully!')
      router.push('/chat')
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
      <form onSubmit={handleUpdateProfile} className="bg-gray-950 p-8 rounded-xl border border-gray-800 w-96 space-y-5 shadow-xl">
        <div className="flex items-center justify-between">
          <button 
            type="button" 
            onClick={() => router.push('/chat')} 
            className="text-gray-400 hover:text-white flex items-center text-xs gap-1"
          >
            <ArrowLeft size={16} /> Back to Chat
          </button>
          <h2 className="text-lg font-bold text-indigo-400">Profile Settings</h2>
        </div>

        {/* Avatar Section */}
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="relative w-20 h-20 rounded-full bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={32} className="text-gray-500" />
            )}
          </div>
          <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-xs px-3 py-1.5 rounded flex items-center gap-2 transition">
            <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Picture'}
            <input type="file" accept="image/*" onChange={uploadAvatar} disabled={uploading} className="hidden" />
          </label>
        </div>

        <div>
          <label className="text-xs text-gray-400">Username</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required
            className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400">Tag (e.g. #0001)</label>
          <input 
            type="text" 
            value={tag} 
            onChange={(e) => setTag(e.target.value)} 
            className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400">Status Message</label>
          <input 
            type="text" 
            value={statusText} 
            onChange={(e) => setStatusText(e.target.value)} 
            placeholder="Hey there! I am using this site."
            className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
          />
        </div>

        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded text-sm font-semibold transition flex items-center justify-center gap-2">
          <Save size={16} /> Save Changes
        </button>
      </form>
    </div>
  )
}
