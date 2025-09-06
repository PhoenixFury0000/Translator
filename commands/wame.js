export const wame = {
  name: 'wame',
  description: 'Generate WhatsApp link for any user',
  usage: '.wame [@user|phone_number]',
  async execute(msg, args, { sock, m, config }) {
    try {
      let s_id;
      if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {  
      s_id = m.message.extendedTextMessage.contextInfo.mentionedJid[0];  
      } else if (m.message?.extendedTextMessage?.contextInfo?.participant) {  
      s_id = m.message.extendedTextMessage.contextInfo.participant;  
      } else if (args.length > 0) {  
        let num = args[0];  
        num = num.replace(/[^0-9]/g, '');  
        if (num.startsWith('0')) {  
        num = num.substring(1);  
        }  
        s_id= num + '@s.whatsapp.net';  
        } else {  
        s_id = m.key.participant || m.key.remoteJid;  
      }  
      
      const n = s_id.split('@')[0];  
      const w = `https://wa.me/${n}`;  
      await sock.sendMessage(msg.from, {  
        text: `*WA Link for ${n}:*\n${w}`,  
        mentions: [s_id]  
      }, { quoted: m });

    } catch (e) {
      console.error(e);
      await msg.reply('err');
    }
  }
};
