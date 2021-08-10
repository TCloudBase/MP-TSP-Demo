App({
	onLaunch:async function(){
		let { resourceAppid,resourceEnv } = wx.getExtConfigSync()
		this.cloud = new wx.cloud.Cloud({
			resourceAppid,
			resourceEnv
		})
	},
	getCloud:async function(){
		if(this.cloudflag !=true){
			this.info = await this.cloud.init()
			this.cloudflag = true
		}
		return this.cloud
	}
})