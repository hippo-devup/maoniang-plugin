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
					reg: '^#reset_gpt',
					fnc: 'resetGPT'
				}
            ]
        })
		
		this.task = {
		  cron: "0 0 */30 * * *",
		  name: "自动回复",
		  fnc: () => this.auto_reply(),
		  log: true
		};
    }
	
	async auto_reply() {
		for (let gid of config.groups) {
			let g = Bot.pickGroup(gid)
			let hist = await g.getChatHistory(0, 1)
			if (hist[0] && hist[0].time < (new Date()).getTime() - 20 * 60 * 1000) {
				let e = {group: g, group_id: gid, msg: hist[0].message, mock: true, usr_id: hist[0].user_id}
				processContent(e)
			}
		}
	}
	
	async GPTReply(e) {
		if (!isClassInitialized) {
            gpt.v1({
                prompt: gpt_config.init_prompt,
                markdown: gpt_config.markdown,
            }, async (error, result) => {
				if (!error) {
					isClassInitialized = true
					logger.mark(result.gpt, 'gpt')
					messagesSave = [{ role: 'user', content: gpt_config.init_prompt }, { role: 'assistant', content: result.gpt }];
					return await this.processContent(e)
				}
			})
		} else {
			return await this.processContent(e)
		}
	}
	
    async processContent(e) {
        let inputMessage = e.msg;
		let qq = e.user_id;
		let nickname = ''
		nickname = await (e.group.pickMember(qq).card || e.group.pickMember(qq).nickname)
		nickname = nickname?.replace(/\s*\d{9}(-\d{1})?/, '')
		
		let content = inputMessage.replace(/^([?]|？)/, '').trim();
		content = '有个叫“' + nickname.replace(/"/g, '') + '”说了这样一句话：' + content + '，请用你猫娘的身份回复'

        if (content) {
            let historicalMessages = messagesSave || [];
            gpt.v1({
                messages: historicalMessages,
                prompt: content,
                model: gpt_config.model,
                markdown: gpt_config.markdown,
            }, (error, result) => {
                if (error) {
                    logger.error(error, 'error');
                    return false;
                } else {
                    if (result.code === 200) {
                        let responseMessage = result.gpt;
						let json = JSON.parse(responseMessage)
						if (json && json.answer) {
							if (!e.mock) {
								e.reply([segment.at(qq), json.answer]);
							} else {
								g.sendMsg([segment.at(qq), json.answer]);
							}
							
							messagesSave = [...historicalMessages, { role: 'user', content: content }, { role: 'assistant', content: responseMessage }];
							return true;
						} else {
							logger.error('远程服务器返回错误代码 ' + result.code + ' ，请等待开发者修复', 'error');
							return false;
						}
                    } else {
                        logger.error('远程服务器返回错误代码 ' + result.code + ' ，请等待开发者修复', 'error');
                        return false;
                    }
                }
            });
        }
    }

    async resetGPT(e) {
        const cnt = (messagesSave || []).length;

        messagesSave = [];
        await e.reply(`已清空${cnt}条对话记录`, true);

        return true;
    }
}