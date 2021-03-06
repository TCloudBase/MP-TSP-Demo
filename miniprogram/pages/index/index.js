const app = getApp()
Page({
	data: {
		flag: false,
		loading: true
	},
	async onLoad() {
		await this.init()
	},
	async init() {
		await app.getCloud()
		let info = JSON.parse(app.info.errMsg)
		let logosrc = await (await app.getCloud()).getTempFileURL({
			fileList: [{
				fileID: info.logo
			}]
		})
		info.logo = logosrc.fileList[0].tempFileURL
		this.setData({
			...info
		})
		this.getUserInfo()
	},
	bind(res) {
		this.getUserInfo({
			fail() {
				wx.showModal({
					title: '提示',
					content: '为了保证消息来源可追溯，需要用户信息授权。本应用只用于展示，不用于任何其他地方～',
					showCancel: false
				})
			}
		})
	},
	getUserInfo(obj = {}) {
		const that = this
		that.setData({
			loading: true
		})
		wx.getUserInfo({
			success: async function (res) {
				(await app.getCloud()).callFunction({
					name: 'inituser',
					data: {
						info: res.userInfo
					},
					success(res) {
						that.setData({
							flag: true,
							loading: false
						})
						obj.success ? obj.success() : null
					},
					fail(e) {
						that.setData({
							flag: false,
							loading: false
						})
						wx.showModal({
							title: '网络错误',
							content: '设备网络服务出现异常，请稍后再试～',
							showCancel: false
						})
					}
				})
			},
			fail(e) {
				that.setData({
					flag: false,
					loading: false
				})
				obj.fail ? obj.fail() : null
			}
		})
	}
})