// Nexconn Call SDK: 1:1 audio/video calls between the traveller and the agent desk, started from the chat panel.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NCCallEngine, NCCallMediaType, NCCallType } from '@nexconn/call'

export interface CallEvents {
  onIncoming(callId: string, from: string): void
  onConnected(): void
  onEnded(): void
}

let engine: any = null

export function installCall() {
  try {
    NCCallEngine.install()
  } catch {
    /* already installed */
  }
}

export function initCall(ev: CallEvents) {
  engine = NCCallEngine.initialize({} as any)
  engine.setCallEventHandler({
    onCallReceived(e: any) {
      const s = e.session
      ev.onIncoming(s?.callId ?? s?.getCallId?.(), s?.callerUserId ?? s?.getCallerUserId?.() ?? '')
    },
    onCallConnected() {
      ev.onConnected()
    },
    onCallEnded() {
      ev.onEnded()
    },
  })
}

function views(peer: string, local: HTMLVideoElement, remote: HTMLVideoElement) {
  engine.setLocalVideoView({ videoElement: local })
  engine.setRemoteVideoView([{ userId: peer, videoElement: remote }])
}

export async function startVideoCall(peer: string, local: HTMLVideoElement, remote: HTMLVideoElement) {
  if (!engine) throw new Error('Calls are not ready')
  views(peer, local, remote)
  const r = await engine.startCall({ calleeIds: [peer], callType: NCCallType.SINGLE, mediaType: NCCallMediaType.AUDIO_VIDEO })
  if (!r?.callId) {
    if (r?.code === 80006) throw new Error('VoIP / Call service is not enabled on this Nexconn App Key yet (80006)')
    throw new Error(`Call failed (${r?.code})`)
  }
  return r.callId as string
}

export async function acceptVideoCall(callId: string, peer: string, local: HTMLVideoElement, remote: HTMLVideoElement) {
  views(peer, local, remote)
  await engine.acceptCall({ callId })
}

export async function endVideoCall(callId?: string) {
  await engine?.endCall(callId ? { callId } : {})
}
