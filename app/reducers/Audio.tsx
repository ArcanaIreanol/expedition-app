import Redux from 'redux'
import {AudioSetAction, AudioStoreBufferAction} from '../actions/ActionTypes'
import {AudioState} from './StateTypes'

const initialState: AudioState = {
  paused: false,
  intensity: 0,
  sfx: null,
  timestamp: 0,
};

export function audio(state: AudioState = initialState, action: Redux.Action): AudioState {
  switch(action.type) {
    case 'AUDIO_SET':
      return {...state, ...(action as AudioSetAction).changes};
    default:
      return state;
  }
}
