// 添付文書の項目マスタ（新記載要領）
//
// 項目番号と項目名称は記載要領で固定されている。該当する記載がない項目は省略できるが、
// 項目番号は繰り上げない。比較表示ではこのマスタの番号・名称・順序を全品目共通で使う。
//
// source:
//   "JPMA"     日本製薬工業協会「医療用医薬品添付文書情報の電子ファイル作成の手引き（暫定版第1版）」
//              4.3 項目名一覧（2019年5月）で開始タグが示されているもの
//   "PMDA-XML" 手引きでは開始タグが空欄のため、PMDA が公開している実際の XML で要素名を確認したもの
//
// parent を持つ項目は、親項目の行の下に小項目の行として表示する。

export const ITEM_MASTER = [
  { no: "1", name: "警告", tag: "Warnings", source: "JPMA" },
  { no: "2", name: "禁忌（次の患者には投与しないこと）", tag: "ContraIndications", source: "JPMA" },
  { no: "3", name: "組成・性状", tag: "CompositionAndProperty", source: "JPMA" },
  { no: "3.1", name: "組成", tag: "Composition", parent: "CompositionAndProperty", source: "JPMA" },
  { no: "3.2", name: "製剤の性状", tag: "Property", parent: "CompositionAndProperty", source: "JPMA" },
  { no: "4", name: "効能又は効果", tag: "IndicationsOrEfficacy", source: "JPMA" },
  { no: "5", name: "効能又は効果に関連する注意", tag: "EfficacyRelatedPrecautions", source: "JPMA" },
  { no: "6", name: "用法及び用量", tag: "InfoDoseAdmin", source: "JPMA" },
  { no: "7", name: "用法及び用量に関連する注意", tag: "InfoPrecautionsDosage", source: "JPMA" },
  { no: "8", name: "重要な基本的注意", tag: "ImportantPrecautions", source: "JPMA" },
  { no: "9", name: "特定の背景を有する患者に関する注意", tag: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.1", name: "合併症・既往歴等のある患者", tag: "UseInPatientsWithComplicationsOrHistoryOfDiseasesEtc", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.2", name: "腎機能障害患者", tag: "PatientsWithRenalImpairment", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.3", name: "肝機能障害患者", tag: "PatientsWithHepaticImpairment", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.4", name: "生殖能を有する者", tag: "MalesAndFemalesOfReproductivePotential", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.5", name: "妊婦", tag: "UseInPregnant", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.6", name: "授乳婦", tag: "UseInNursing", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.7", name: "小児等", tag: "PediatricUse", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "9.8", name: "高齢者", tag: "UseInTheElderly", parent: "UseInSpecificPopulations", source: "JPMA" },
  { no: "10", name: "相互作用", tag: "Interactions", source: "JPMA" },
  { no: "10.1", name: "併用禁忌（併用しないこと）", tag: "ContraIndicatedCombinations", parent: "Interactions", source: "JPMA" },
  { no: "10.2", name: "併用注意（併用に注意すること）", tag: "PrecautionsForCombinations", parent: "Interactions", source: "JPMA" },
  { no: "11", name: "副作用", tag: "AdverseEvents", source: "JPMA" },
  { no: "11.1", name: "重大な副作用", tag: "SeriousAdverseEvents", parent: "AdverseEvents", source: "JPMA" },
  { no: "11.2", name: "その他の副作用", tag: "OtherAdverseEvents", parent: "AdverseEvents", source: "JPMA" },
  { no: "12", name: "臨床検査結果に及ぼす影響", tag: "InfluenceOnLaboratoryValues", source: "JPMA" },
  { no: "13", name: "過量投与", tag: "OverDosage", source: "JPMA" },
  { no: "14", name: "適用上の注意", tag: "PrecautionsForApplication", source: "JPMA" },
  { no: "15", name: "その他の注意", tag: "OtherPrecautions", source: "JPMA" },
  { no: "15.1", name: "臨床使用に基づく情報", tag: "InformationBasedOnClinicalUse", parent: "OtherPrecautions", source: "PMDA-XML" },
  { no: "15.2", name: "非臨床試験に基づく情報", tag: "InformationBasedOnNonclinicalStudies", parent: "OtherPrecautions", source: "PMDA-XML" },
  { no: "16", name: "薬物動態", tag: "Pharmacokinetics", source: "JPMA" },
  { no: "16.1", name: "血中濃度", tag: "BloodLevel", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.2", name: "吸収", tag: "Absorption", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.3", name: "分布", tag: "Distribution", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.4", name: "代謝", tag: "Metabolism", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.5", name: "排泄", tag: "Excretion", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.6", name: "特定の背景を有する患者", tag: "SpecificPopulation", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.7", name: "薬物相互作用", tag: "DrugAndDrugInteractions", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "16.8", name: "その他", tag: "PharmacokineticsEtc", parent: "Pharmacokinetics", source: "PMDA-XML" },
  { no: "17", name: "臨床成績", tag: "ResultsOfClinicalTrials", source: "JPMA" },
  { no: "17.1", name: "有効性及び安全性に関する試験", tag: "EfficacyAndSafety", parent: "ResultsOfClinicalTrials", source: "PMDA-XML" },
  // 要素名の綴りは PMDA の XML のまま（Surveylances）
  { no: "17.2", name: "製造販売後調査等", tag: "PostMarketingSurveylancesEtc", parent: "ResultsOfClinicalTrials", source: "PMDA-XML" },
  { no: "17.3", name: "その他", tag: "ResultsOfClinicalTrialsEtc", parent: "ResultsOfClinicalTrials", source: "PMDA-XML" },
  { no: "18", name: "薬効薬理", tag: "EfficacyPharmacology", source: "JPMA" },
  { no: "18.1", name: "作用機序", tag: "MechanismOfAction", parent: "EfficacyPharmacology", source: "PMDA-XML" },
  { no: "19", name: "有効成分に関する理化学的知見", tag: "PhyschemOfActIngredients", source: "JPMA" },
  { no: "20", name: "取扱い上の注意", tag: "PrecautionsForHandling", source: "JPMA" },
  { no: "21", name: "承認条件", tag: "ConditionsOfApproval", source: "JPMA" },
  { no: "22", name: "包装", tag: "Package", source: "JPMA" },
  { no: "23", name: "主要文献", tag: "MainLiterature", source: "JPMA" },
  { no: "24", name: "文献請求先及び問い合わせ先", tag: "AddresseeOfLiteratureRequest", source: "JPMA" },
  { no: "25", name: "保険給付上の注意", tag: "AttentionOfInsurance", source: "JPMA" },
  { no: "26", name: "製造販売業者等", tag: "NameAddressManufact", source: "JPMA" },
];

// 比較表の行キー（親項目は要素名、小項目は「親/子」）
export const itemKey = (item) => (item.parent ? `${item.parent}/${item.tag}` : item.tag);

export const ITEM_BY_TAG = new Map(ITEM_MASTER.map((it) => [it.tag, it]));
export const PARENT_TAGS = new Set(ITEM_MASTER.filter((it) => it.parent).map((it) => it.parent));
