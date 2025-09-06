/*

Ok bro in this you define every command you added 

dont mess it up

*/

import { ping } from './ping.js';
import { alive } from './alive.js';
import { menu } from './menu.js';
import { song } from './song.js';
import { tr } from './tr.js';
import { wame } from './wame.js';
import { define } from './define.js';
import { status } from './status.js';
import { time } from './time.js';
import { tre } from './tre.js';

export const commands = new Map([
  [ping.name, ping],
  [alive.name, alive],
  [menu.name, menu],
  [song.name, song],
  [tr.name, tr],
  [wame.name, wame],
  [define.name, define],
  [status.name, status],
  [time.name, time],
  [tre.name, tre]
]);

export async function Command(cmd, msg, args, context) {
  const command = commands.get(cmd);
  if (!command) {
    return false;
  }
  try {
    await command.execute(msg, args, context);
    return true;
  } catch (error) {
    console.error(`${cmd}:`, error);
    msg.reply('_err_');
    return false;
  }
}
