import type { Recruitment } from "./schema.js";

// Editorial examples only. They appear in preview until an editor replaces them
// with confirmed positions and clears the example marker.
export const exampleRecruitment: Recruitment = {
  jobs: [
    {
      id: "example-project-manager",
      title: "社会创新项目经理",
      type: "full-time",
      location: "上海",
      summary: "连接合作伙伴与项目团队，推动社会创新项目从想法走向实践。",
      responsibilities: "规划项目进度\n协调合作伙伴与内部团队\n整理项目成果。",
      requirements: "具有项目执行和跨团队沟通经验\n关注青年成长与社会创新。",
      commitment: "到岗时间待确认",
      status: "open",
      isExample: true,
    },
    {
      id: "example-content-intern",
      title: "内容运营实习生",
      type: "internship",
      location: "上海",
      summary: "记录项目现场的故事，参与内容策划、编辑与传播。",
      responsibilities: "整理活动素材\n协助撰写和校对内容\n维护内容资料。",
      requirements: "文字表达清晰\n做事细致\n愿意学习内容运营。",
      commitment: "实习安排待确认",
      status: "open",
      isExample: true,
    },
    {
      id: "example-research-intern",
      title: "项目研究实习生",
      type: "internship",
      location: "上海 / 远程",
      summary: "通过议题研究、访谈整理与资料分析，为项目设计提供依据。",
      responsibilities: "查阅公开资料\n整理访谈与调研记录\n协助形成研究摘要。",
      requirements: "善于检索和归纳资料\n对社会议题保持好奇。",
      commitment: "实习安排待确认",
      status: "open",
      isExample: true,
    },
  ],
};
