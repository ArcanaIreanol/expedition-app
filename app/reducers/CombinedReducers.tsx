import Redux from 'redux'
import {announcement} from './Announcement'
import {audio} from './Audio'
import {card} from './Card'
import {dialog} from './Dialog'
import {quest} from './Quest'
import {search} from './Search'
import {settings} from './Settings'
import {snackbar} from './Snackbar'
import {user} from './User'
import {userFeedback} from './UserFeedback'
import {remotePlay} from './RemotePlay'
import {AppStateWithHistory, AppState} from './StateTypes'
import {ReturnAction} from '../actions/ActionTypes'

function combinedReduce(state: AppStateWithHistory, action: Redux.Action): AppState {
  state = state || ({} as AppStateWithHistory);
  return {
    announcement: announcement(state.announcement, action),
    audio: audio(state.audio, action),
    card: card(state.card, action),
    dialog: dialog(state.dialog, action),
    quest: quest(state.quest, action),
    search: search(state.search, action),
    settings: settings(state.settings, action),
    snackbar: snackbar(state.snackbar, action),
    user: user(state.user, action),
    userFeedback: userFeedback(state.userFeedback, action),
    remotePlay: remotePlay(state.remotePlay, action),
  };
}

function isReturnState(state: AppState, action: ReturnAction): boolean {
  const matchesName = state.card.name === action.to.name;
  const matchesPhase = (action.to.phase && state.card && action.to.phase === state.card.phase);
  return (matchesName && (!action.to.phase || matchesPhase));
}

export default function combinedReducerWithHistory(state: AppStateWithHistory, action: Redux.Action): AppStateWithHistory {
  let history: AppState[] = [];

  if (state !== undefined) {
    if (state._history === undefined) {
      state._history = [];
    }
    // If action is "Return", pop history accordingly
    if (action.type === 'RETURN') {
      let pastStateIdx: number = state._history.length-1;

      const returnAction = action as ReturnAction;
      if (returnAction.to && (returnAction.to.name || returnAction.to.phase)) {
        while (pastStateIdx > 0 && !isReturnState(state._history[pastStateIdx], returnAction)) {
          pastStateIdx--;
        }
      } else if (returnAction.skip) {
        // Skip past any explicitly blacklisted card types
        while (pastStateIdx > 0) {
          let skipCard: boolean = false;
          for (const s of returnAction.skip) {
            if (s.name === state._history[pastStateIdx].card.name && (!s.phase || s.phase === state._history[pastStateIdx].card.phase)) {
              skipCard = true;
              break;
            }
          }
          if (!skipCard) {
            break;
          }
          pastStateIdx--;
        }
      }

      if (returnAction.before) {
        pastStateIdx--;
      }

      return {
        ...state._history[pastStateIdx],
        _history: state._history.slice(0, pastStateIdx),
        settings: state.settings, // global settings should not be rewound.
        _return: true,
      } as AppStateWithHistory;
    }

    // Create a new array (objects may be shared)
    history = state._history.slice();

    if (action.type === 'PUSH_HISTORY') {
      // Save a copy of existing state to _history
      history.push({...state, _history: undefined, _return: undefined, settings: undefined} as AppState);
    }
  }

  // Run the reducers on the new action
  return Object.assign(combinedReduce(state, action), {_history: history, _return: false}) as AppStateWithHistory;
}
