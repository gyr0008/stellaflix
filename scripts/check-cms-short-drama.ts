/**
 * 检查CMS源中的短剧类型
 */

const CMS_API = "https://cj.ffzyapi.com/api.php/provide/vod/";

async function main() {
  console.log("\n🔍 检查CMS源中的短剧类型...\n");

  try {
    // 获取分类列表
    const categoriesResponse = await fetch(`${CMS_API}?ac=list`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    const categoriesData = await categoriesResponse.json();

    console.log("📁 CMS分类列表:");
    if (categoriesData.class) {
      categoriesData.class.forEach((c: any) => {
        console.log(`   ${c.type_id}: ${c.type_name}`);
      });
    }

    // 搜索短剧类型
    console.log("\n🔍 搜索短剧相关内容...");
    const searchResponse = await fetch(`${CMS_API}?ac=detail&wd=短剧&pg=1`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    const searchData = await searchResponse.json();

    if (searchData.list && searchData.list.length > 0) {
      console.log(`   找到 ${searchData.list.length} 条短剧相关结果`);
      searchData.list.slice(0, 5).forEach((v: any) => {
        console.log(`   - ${v.vod_name} | 类型: ${v.vod_class} | 时长: ${v.vod_duration || '未知'}`);
      });
    } else {
      console.log("   未找到短剧相关内容");
    }

    // 检查竖屏视频
    console.log("\n🔍 搜索竖屏视频...");
    const verticalResponse = await fetch(`${CMS_API}?ac=detail&wd=竖屏&pg=1`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    const verticalData = await verticalResponse.json();

    if (verticalData.list && verticalData.list.length > 0) {
      console.log(`   找到 ${verticalData.list.length} 条竖屏视频`);
      verticalData.list.slice(0, 5).forEach((v: any) => {
        console.log(`   - ${v.vod_name} | 类型: ${v.vod_class} | 时长: ${v.vod_duration || '未知'}`);
      });
    } else {
      console.log("   未找到竖屏视频");
    }

    // 检查微短剧
    console.log("\n🔍 搜索微短剧...");
    const microResponse = await fetch(`${CMS_API}?ac=detail&wd=微短剧&pg=1`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    const microData = await microResponse.json();

    if (microData.list && microData.list.length > 0) {
      console.log(`   找到 ${microData.list.length} 条微短剧`);
      microData.list.slice(0, 5).forEach((v: any) => {
        console.log(`   - ${v.vod_name} | 类型: ${v.vod_class} | 时长: ${v.vod_duration || '未知'}`);
      });
    } else {
      console.log("   未找到微短剧");
    }

  } catch (e) {
    console.error("错误:", (e as Error).message);
  }
}

main().catch(console.error);
