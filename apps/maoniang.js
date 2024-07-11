import plugin from '../../../lib/plugins/plugin.js'
import config from '../components/setting.js'
import { gpt } from 'gpti'

// 存储对话
const messagesSave = [];

//设置初始状态
var isClassInitialized  = false;

const gpt_config   = config.getConfig('gpt')

export class gpt_use extends plugin {
    constructor() {
        super({
            name: 'gpt',
            dsc: 'gpt',
            event: 'message',
            priority: 1001,
            rule: [
                {
                    reg: '^([?]|？)([\\s\\S]*)$',
                    fnc: 'GPTReply'
                },
				{
					reg: '^#resetgpt',
					fnc: 'resetGPT'
				},
				{
					reg: '^#autoreply',
					fnc: 'auto_reply'
				}
            ]
        })
		
		this.task = {
		  cron: "0 */20 * * * *",
		  name: "自动回复",
		  fnc: () => this.auto_reply(),
		  log: true
		};
    }
	
	async auto_reply() {
		for (let gid of gpt_config.groups) {
			let g = Bot.pickGroup(gid)
			let hist = await g.getChatHistory(0, 1)
			if (hist[0] && hist[0].time < (new Date()).getTime() / 1000 - 20 * 60) {
				if (hist[0].user_id == Bot.uin) continue
				
				let txt = hist[0].message[0].type == 'text' ? hist[0].message[0].text : ''
				let e = {group: g, group_id: gid, isGroup: true, msg: txt, mock: true, user_id: hist[0].user_id, sender: hist[0].sender}
				await this.GPTReply(e) //wait to complete
			}
		}
	}
	
	async GPTReply(e) {
		if (!isClassInitialized) {
            gpt.v1({
                messages: [],
                model: gpt_config.model,
                prompt: gpt_config.init_prompt,
                markdown: gpt_config.markdown,
            }, async (error, result) => {
				if (!error) {
					isClassInitialized = true
					logger.mark(result.gpt, 'watch gpts output')
					messagesSave.push({ role: 'user', content: gpt_config.init_prompt }, { role: 'assistant', content: result.gpt });
					
					return await this.processContent(e)
				}
			})
		} else {
			return await this.processContent(e)
		}
	}
	
    async processContent(e) {
        let inputMessage = e.msg || '';
		let qq = e.user_id;
		let nickname = e.sender.card || e.sender.nickname || ''
		nickname = nickname?.replace(/\s*\d{9}(-\d{1})?/, '').replace(/"/g, '')
		
		let content = inputMessage.replace(/^([?]|？)/, '').trim();
		
		if (!content) {
			console.log('没有内容')
			return true
		}
		

		content = '有个叫“' + nickname + '”的人说：' + content + '\n\n请用猫娘身份回复'
		
        if (content) {
            let historicalMessages = messagesSave || [];
            gpt.v1({
                messages: historicalMessages,
                prompt: content,
                model: gpt_config.model,
                markdown: gpt_config.markdown,
            }, async (error, result) => {
                if (error) {
                    logger.error(error, 'req fix 1');
                    return false;
                } else {
                    if (result.code === 200) {
						let responseMessage = result.gpt.replace(/```json/g, '').replace(/```/g, '').replace(/,[}]/g, '}').trim();
						
						let json = JSON.parse(responseMessage)
						logger.mark(result.gpt, 'gpt')
						if (json && json.answer) {
							if (!e.mock) {
								if (e.isGroup)
									 await e.reply([json.answer, segment.at(qq)]);
								else
									await e.reply(json.answer)
							} else {
								 await e.group.sendMsg([json.answer, segment.at(qq)]);
							}
							
							messagesSave.push({ role: 'user', content: content }, {role: 'assistant', content: responseMessage});
							return true;
						} else {
							logger.error(`Server Return ${result.code}`, 'req fix 2');
							return false;
						}
                    } else {
                        logger.error(`Server Return ${result.code}`, 'req fix 3');
                        return false;
                    }
                }
            });
        }
    }

    async resetGPT(e) {
        const cnt = (messagesSave || []).length;

        messagesSave.length = 0;
        e.reply(`已清空${cnt}条对话记录`, true);

        return true;
    }
}