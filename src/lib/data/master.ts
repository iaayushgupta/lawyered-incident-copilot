// ─────────────────────────────────────────────────────────────────────────────
// Master seed data — all clearly synthetic.
//
// No real Aadhaar/phone/licence/vehicle-owner/officer/lawyer/case data is used.
// Phone and licence values are stored already-masked.
// ─────────────────────────────────────────────────────────────────────────────

import type { Driver, Fleet, Lawyer, LegalSource, Role, Vehicle } from "../types";

export const FLEETS: Fleet[] = [
  { id: "flt-northstar", name: "NorthStar Logistics", operatingStates: ["Rajasthan", "Delhi", "Haryana", "Uttar Pradesh"], vehicleCount: 940 },
  { id: "flt-deccan", name: "Deccan Freightways", operatingStates: ["Maharashtra", "Karnataka", "Telangana", "Goa"], vehicleCount: 812 },
  { id: "flt-coastal", name: "Coastal Movers Co-op", operatingStates: ["Gujarat", "Rajasthan", "Madhya Pradesh"], vehicleCount: 666 },
];

export const VEHICLES: Vehicle[] = [
  { id: "veh-1", fleetId: "flt-northstar", registration: "RJ14-GC-4821", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
  { id: "veh-2", fleetId: "flt-northstar", registration: "HR55-AK-1107", vehicleClass: "Goods Carrier (LGV)", type: "goods_carrier" },
  { id: "veh-3", fleetId: "flt-northstar", registration: "DL01-LR-2391", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
  { id: "veh-4", fleetId: "flt-northstar", registration: "UP80-TC-6642", vehicleClass: "Container Truck", type: "container" },
  { id: "veh-5", fleetId: "flt-northstar", registration: "RJ19-GA-3390", vehicleClass: "Tanker", type: "tanker" },
  { id: "veh-6", fleetId: "flt-northstar", registration: "HR26-BX-5540", vehicleClass: "Trailer", type: "trailer" },
  { id: "veh-7", fleetId: "flt-deccan", registration: "MH04-TX-8820", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
  { id: "veh-8", fleetId: "flt-deccan", registration: "MH12-QP-1188", vehicleClass: "Container Truck", type: "container" },
  { id: "veh-9", fleetId: "flt-deccan", registration: "KA05-RT-7702", vehicleClass: "Goods Carrier (LGV)", type: "goods_carrier" },
  { id: "veh-10", fleetId: "flt-deccan", registration: "TS09-MN-4413", vehicleClass: "Tanker", type: "tanker" },
  { id: "veh-11", fleetId: "flt-deccan", registration: "KA51-DD-9021", vehicleClass: "Trailer", type: "trailer" },
  { id: "veh-12", fleetId: "flt-deccan", registration: "GA02-LC-3345", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
  { id: "veh-13", fleetId: "flt-coastal", registration: "GJ01-FR-5567", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
  { id: "veh-14", fleetId: "flt-coastal", registration: "GJ18-HK-2290", vehicleClass: "Container Truck", type: "container" },
  { id: "veh-15", fleetId: "flt-coastal", registration: "RJ27-PL-8834", vehicleClass: "Goods Carrier (LGV)", type: "goods_carrier" },
  { id: "veh-16", fleetId: "flt-coastal", registration: "MP09-VC-1120", vehicleClass: "Tanker", type: "tanker" },
  { id: "veh-17", fleetId: "flt-coastal", registration: "GJ05-TT-6678", vehicleClass: "Trailer", type: "trailer" },
  { id: "veh-18", fleetId: "flt-coastal", registration: "RJ14-GC-4820", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
  { id: "veh-19", fleetId: "flt-northstar", registration: "DL03-WQ-7781", vehicleClass: "Container Truck", type: "container" },
  { id: "veh-20", fleetId: "flt-deccan", registration: "MH14-BG-9954", vehicleClass: "Goods Carrier (HGV)", type: "goods_carrier" },
];

export const DRIVERS: Driver[] = [
  { id: "drv-1", fleetId: "flt-northstar", name: "Ramesh Kumar", phoneMasked: "98••••21", licenceMasked: "RJ••••••41", languages: ["Hindi", "English"] },
  { id: "drv-2", fleetId: "flt-northstar", name: "Suresh Yadav", phoneMasked: "99••••07", licenceMasked: "HR••••••17", languages: ["Hindi"] },
  { id: "drv-3", fleetId: "flt-northstar", name: "Balwinder Singh", phoneMasked: "97••••55", licenceMasked: "DL••••••23", languages: ["Punjabi", "Hindi"] },
  { id: "drv-4", fleetId: "flt-northstar", name: "Imran Sheikh", phoneMasked: "90••••88", licenceMasked: "UP••••••90", languages: ["Hindi", "Urdu"] },
  { id: "drv-5", fleetId: "flt-northstar", name: "Deepak Meena", phoneMasked: "88••••34", licenceMasked: "RJ••••••12", languages: ["Hindi"] },
  { id: "drv-6", fleetId: "flt-deccan", name: "Ganesh Patil", phoneMasked: "98••••20", licenceMasked: "MH••••••82", languages: ["Marathi", "Hindi"] },
  { id: "drv-7", fleetId: "flt-deccan", name: "Ravi Naik", phoneMasked: "96••••18", licenceMasked: "KA••••••02", languages: ["Kannada", "Hindi"] },
  { id: "drv-8", fleetId: "flt-deccan", name: "Farhan Qureshi", phoneMasked: "95••••13", licenceMasked: "TS••••••44", languages: ["Telugu", "Hindi", "English"] },
  { id: "drv-9", fleetId: "flt-deccan", name: "Sandeep Rao", phoneMasked: "94••••21", licenceMasked: "KA••••••90", languages: ["Kannada"] },
  { id: "drv-10", fleetId: "flt-deccan", name: "Nitin Shinde", phoneMasked: "93••••54", licenceMasked: "MH••••••99", languages: ["Marathi"] },
  { id: "drv-11", fleetId: "flt-coastal", name: "Jignesh Patel", phoneMasked: "92••••67", licenceMasked: "GJ••••••56", languages: ["Gujarati", "Hindi"] },
  { id: "drv-12", fleetId: "flt-coastal", name: "Mahesh Solanki", phoneMasked: "91••••90", licenceMasked: "GJ••••••22", languages: ["Gujarati"] },
  { id: "drv-13", fleetId: "flt-coastal", name: "Pravin Chauhan", phoneMasked: "90••••34", licenceMasked: "RJ••••••88", languages: ["Hindi"] },
  { id: "drv-14", fleetId: "flt-coastal", name: "Alok Verma", phoneMasked: "89••••20", licenceMasked: "MP••••••20", languages: ["Hindi", "English"] },
  { id: "drv-15", fleetId: "flt-coastal", name: "Kiran Bhatt", phoneMasked: "88••••78", licenceMasked: "GJ••••••78", languages: ["Gujarati", "Hindi"] },
];

export const LAWYERS: Lawyer[] = [
  { id: "law-1", name: "Adv. Neha Sharma", jurisdictions: ["Rajasthan", "Delhi"], languages: ["Hindi", "English"], specialisations: ["Motor vehicles", "Interstate permits", "Roadside detention"], availability: "available", activeCaseload: 3, medianResponseMinutes: 6, successRate: 0.86, costBand: "standard", supportedIncidentTypes: ["permit_issue", "vehicle_detention", "traffic_challan", "police_interaction"], qualityScore: 0.88, rating: 4.8 },
  { id: "law-2", name: "Adv. Arjun Mehta", jurisdictions: ["Maharashtra", "Goa"], languages: ["Marathi", "Hindi", "English"], specialisations: ["Accident claims", "Insurance disputes"], availability: "available", activeCaseload: 5, medianResponseMinutes: 11, successRate: 0.79, costBand: "premium", supportedIncidentTypes: ["accident", "cargo_issue", "vehicle_document_issue"], qualityScore: 0.82, rating: 4.6 },
  { id: "law-3", name: "Adv. Fatima Rizvi", jurisdictions: ["Delhi", "Haryana", "Uttar Pradesh"], languages: ["Hindi", "Urdu", "English"], specialisations: ["Traffic challans", "Virtual court", "Driver documents"], availability: "busy", activeCaseload: 8, medianResponseMinutes: 14, successRate: 0.83, costBand: "economy", supportedIncidentTypes: ["traffic_challan", "driver_document_issue", "court_issue"], qualityScore: 0.8, rating: 4.5 },
  { id: "law-4", name: "Adv. Vikram Reddy", jurisdictions: ["Telangana", "Karnataka"], languages: ["Telugu", "Kannada", "English"], specialisations: ["Border & tax", "Cargo", "Interstate permits"], availability: "available", activeCaseload: 4, medianResponseMinutes: 9, successRate: 0.81, costBand: "standard", supportedIncidentTypes: ["tax_border_issue", "cargo_issue", "permit_issue"], qualityScore: 0.84, rating: 4.7 },
  { id: "law-5", name: "Adv. Priya Nair", jurisdictions: ["Karnataka", "Maharashtra"], languages: ["Kannada", "English", "Hindi"], specialisations: ["Accident claims", "Police interaction", "Bail"], availability: "available", activeCaseload: 2, medianResponseMinutes: 7, successRate: 0.9, costBand: "premium", supportedIncidentTypes: ["accident", "police_interaction", "vehicle_detention"], qualityScore: 0.9, rating: 4.9 },
  { id: "law-6", name: "Adv. Sanjay Gohil", jurisdictions: ["Gujarat", "Rajasthan"], languages: ["Gujarati", "Hindi"], specialisations: ["Permits", "RC & ownership disputes"], availability: "available", activeCaseload: 6, medianResponseMinutes: 13, successRate: 0.76, costBand: "economy", supportedIncidentTypes: ["permit_issue", "vehicle_document_issue", "disputed_vehicle_identity"], qualityScore: 0.75, rating: 4.3 },
  { id: "law-7", name: "Adv. Ritu Bansal", jurisdictions: ["Delhi", "Rajasthan", "Haryana"], languages: ["Hindi", "English"], specialisations: ["Anti-corruption", "Police interaction", "Bribery complaints"], availability: "busy", activeCaseload: 7, medianResponseMinutes: 12, successRate: 0.85, costBand: "standard", supportedIncidentTypes: ["bribery_demand", "police_interaction", "vehicle_detention"], qualityScore: 0.83, rating: 4.6 },
  { id: "law-8", name: "Adv. Mohan Iyer", jurisdictions: ["Madhya Pradesh", "Maharashtra"], languages: ["Hindi", "English", "Marathi"], specialisations: ["Court matters", "Fraud & forgery"], availability: "available", activeCaseload: 3, medianResponseMinutes: 15, successRate: 0.78, costBand: "standard", supportedIncidentTypes: ["court_issue", "possible_fraud", "disputed_vehicle_identity"], qualityScore: 0.79, rating: 4.4 },
  { id: "law-9", name: "Adv. Kavya Menon", jurisdictions: ["All India"], languages: ["English", "Hindi", "Malayalam"], specialisations: ["Complex / cross-jurisdiction", "Escalations"], availability: "busy", activeCaseload: 9, medianResponseMinutes: 18, successRate: 0.88, costBand: "premium", supportedIncidentTypes: ["permit_issue", "vehicle_detention", "accident", "police_interaction", "bribery_demand", "cargo_issue", "tax_border_issue", "court_issue", "possible_fraud", "disputed_vehicle_identity", "unknown_unsupported"], qualityScore: 0.87, rating: 4.7 },
  { id: "law-10", name: "Adv. Harish Chandra", jurisdictions: ["Uttar Pradesh", "Delhi"], languages: ["Hindi"], specialisations: ["General mobility", "Documentation"], availability: "offline", activeCaseload: 1, medianResponseMinutes: 20, successRate: 0.7, costBand: "economy", supportedIncidentTypes: ["driver_document_issue", "vehicle_document_issue", "traffic_challan"], qualityScore: 0.68, rating: 4.1 },
];

export interface AppUser {
  id: string;
  name: string;
  role: Role;
  fleetId: string; // scoping for tenant isolation; admin/auditor use "*"
  lawyerId?: string;
}

export const USERS: AppUser[] = [
  { id: "usr-driver-1", name: "Ramesh Kumar (Driver)", role: "driver", fleetId: "flt-northstar" },
  { id: "usr-fleet-1", name: "Anita Desai (NorthStar Ops)", role: "fleet_operator", fleetId: "flt-northstar" },
  { id: "usr-fleet-2", name: "Rahul Kulkarni (Deccan Ops)", role: "fleet_operator", fleetId: "flt-deccan" },
  { id: "usr-legalops-1", name: "Meera Iyer (Legal Ops)", role: "legal_ops", fleetId: "flt-northstar" },
  { id: "usr-legalops-2", name: "Tarun Ghosh (Legal Ops)", role: "legal_ops", fleetId: "flt-deccan" },
  { id: "usr-legalops-3", name: "Sneha Kapoor (Legal Ops)", role: "legal_ops", fleetId: "flt-coastal" },
  { id: "usr-legalops-4", name: "Vivek Anand (Legal Ops)", role: "legal_ops", fleetId: "flt-northstar" },
  { id: "usr-legalops-5", name: "Divya Menon (Legal Ops)", role: "legal_ops", fleetId: "flt-deccan" },
  { id: "usr-legalops-6", name: "Karthik Rao (Legal Ops)", role: "legal_ops", fleetId: "flt-coastal" },
  { id: "usr-lawyer-1", name: "Adv. Neha Sharma", role: "lawyer", fleetId: "*", lawyerId: "law-1" },
  { id: "usr-lawyer-5", name: "Adv. Priya Nair", role: "lawyer", fleetId: "*", lawyerId: "law-5" },
  { id: "usr-admin-1", name: "Platform Admin", role: "admin", fleetId: "*" },
  { id: "usr-auditor-1", name: "Independent Auditor", role: "auditor", fleetId: "*" },
];
