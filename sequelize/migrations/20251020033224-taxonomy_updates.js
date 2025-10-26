"use strict";

import models from "../../src/models";
import {
  createInstance,
  destroyInstance,
} from "../../src/services/data-changes";

const taxonomies = [
  // Health child taxonomies
  {
    name: "Substance Use Treatment",
    parent_name: "Health",
    parent_id: "e838dbf0-21f8-47c2-b17d-57543e8dbffb",
    services: [
      "f8af9137-e68a-4872-929c-f921cb253e3b",
      "aa3d0e89-30bf-4a4c-8e5b-48d7bb12b05e",
      "7543b322-18b7-4bf8-a229-58c01bc915f6",
    ],
  },
  {
    name: "General Health",
    parent_name: "Health",
    parent_id: "e838dbf0-21f8-47c2-b17d-57543e8dbffb",
    services: ["af06ff67-257c-488a-a644-cdd56d6204a5"],
  },
  // Other service child taxonomies
  {
    name: "Immigration Services",
    parent_name: "Other service",
    parent_id: "1fad2545-15d0-4613-b34c-1407b8b7e74e",
    services: [
      "d51dea49-8879-44b2-a126-64573d88efcb",
      "8459ca1a-3c92-47d3-bee7-52a5edcd0917",
    ],
  },
  {
    name: "Employment/Internship",
    parent_name: "Other service",
    parent_id: "1fad2545-15d0-4613-b34c-1407b8b7e74e",
    services: [
      "b7159928-c4f1-4ff0-8cd1-b20df75e8c9e",
      "f4e41e59-e0a9-48b6-aaeb-81f51f24a3b7",
      "48de48ee-5c17-4249-9d25-bb1e368839cb",
      "ff56dead-c74b-41ec-a2c0-e3865d26d154",
    ],
  },
  // Clothing child taxonomies
  {
    name: "Interview-Ready Clothing",
    parent_name: "Clothing",
    parent_id: "566956f6-00ad-4f75-ac68-3c56485ed489",
    services: ["9f2d4712-5bd9-4733-bf4e-a3797c32b91b"],
  },
  {
    name: "Baby Supplies",
    parent_name: "Clothing",
    parent_id: "566956f6-00ad-4f75-ac68-3c56485ed489",
    services: [
      "f2b4e501-e954-4f87-9281-7d87bf3e72a2",
      "8a087fde-dfb2-4138-80b1-f8acf97af9d6",
      "c1b69833-402e-4ab9-ae14-d927628bddf5",
      "2f53f8a5-584d-4b2f-81a6-2d62f0dfbd0f",
    ],
  },
  {
    name: "Thrift Shop",
    parent_name: "Clothing",
    parent_id: "566956f6-00ad-4f75-ac68-3c56485ed489",
    services: [
      "bbebe4bc-1e75-4c17-9ff0-81e8913654a8",
      "c4787536-edba-4ef8-b86a-4dda878e83dc",
    ],
  },
  {
    name: "Coat Drive",
    parent_name: "Clothing",
    parent_id: "566956f6-00ad-4f75-ac68-3c56485ed489",
    services: ["daeabbf9-38e2-42df-bdf3-4fc0fecf35ce"],
  },
  {
    name: "Professional Clothing",
    parent_name: "Clothing",
    parent_id: "566956f6-00ad-4f75-ac68-3c56485ed489",
    services: ["b02f4bdb-5aa3-44e5-b3c5-fa71220e0239"],
  },
  // Food child taxonomies
  {
    name: "Food Benefits",
    parent_name: "Food",
    parent_id: "5fc3a1c0-8ca5-4c85-9277-b2f5d3cca9ae",
    services: [
      "03d36f39-8142-40ed-98ae-fc218da91679",
      "53508374-91d4-47dc-9baf-772af2c2688b",
      "6854248d-7124-4962-b930-4f6e2f812456",
      "8b17b6a6-c54c-4c6d-bb83-bad985c596f3",
      "971e82f3-257f-4353-bc16-4d234ec52022",
      "b8520f93-cec8-4c36-8dc8-4dd1dbe5ecbd",
      "dc7a726a-dc93-4237-a5e2-71ee4b3303d5",
      "f49449c9-9295-4b7c-8123-34336e75b0d7",
    ],
  },
  {
    name: "Food Delivery / Meals on Wheels",
    parent_name: "Food",
    parent_id: "5fc3a1c0-8ca5-4c85-9277-b2f5d3cca9ae",
    services: [
      "2ed3b0fb-90df-4c74-bd3e-61890688ba30",
      "6ba8a8bb-d05c-46a0-8988-964fbaa1b541",
    ],
  },
  {
    name: "Appliances",
    parent_name: "Food",
    parent_id: "5fc3a1c0-8ca5-4c85-9277-b2f5d3cca9ae",
    services: ["d464d037-f253-480f-88f3-ebb1ea8c4f20"],
  },
  // Personal Care child taxonomies
  {
    name: "Gym",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: ["01d57b99-79cf-4eea-96ee-a44351aeafab"],
  },
  {
    name: "Drop-in Center",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: ["15a5cb70-2a08-4065-af88-5318aaf5c41c"],
  },
  {
    name: "Baby",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: [
      "34e73653-8a4f-478a-88d8-5f89c612c48b",
      "5053ca3b-50a3-4970-b0fe-1e57ba660f7f",
      "8b3550e2-c9d3-4b2a-8a5f-b898f39561b0",
    ],
  },
  {
    name: "Hygiene",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: ["d19a2743-cde6-45e7-8e1f-01b56f12614d"],
  },
  {
    name: "Community Services",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: ["6ba94bd0-edff-48fb-b1b5-dd6aa051717e"],
  },
  {
    name: "Activities",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: ["94823c07-e57f-4a67-8612-7f4ca3645af3"],
  },
  {
    name: "Support Groups",
    parent_name: "Personal Care",
    parent_id: "238a2f38-1ec9-478f-9066-fcef03feeb98",
    services: [
      "064c76c0-02d8-4f3e-bfbc-89c61e015ae3",
      "1f2e084f-cc12-48fa-9f17-8fd14a03428c",
      "227c22dc-8f84-46ff-8fb9-bc46fcf13fea",
      "6e881ccf-1c04-465b-9ad4-c8b4de4af5a6",
      "764dd286-7aa5-4fc2-ab23-5b3b28bea842",
      "ba67bea9-3b47-4312-b3a6-066d486a772e",
      "c564bd7e-8a0d-4fd8-a17a-139767b599a0",
      "e3de71af-9b79-4b6d-bcb9-d8d9a2011d9e",
      "fe665b6f-6b19-4eb3-ab1b-edf70e68441f",
    ],
  },
  // Shelter child taxonomies
  {
    name: "Intake",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: ["94f947b0-e1a9-45ed-8e67-c84d3cd5afa0"],
  },
  {
    name: "Senior",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: [
      "e415bce3-01dc-4e0b-b9e1-06ae6c890654",
      "0845891b-304f-48ea-8f35-51538eed5648",
    ],
  },
  {
    name: "Drop-in Center",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: [
      "60c5a572-4d2d-4c77-898e-7b4433a3dc1e",
      "bb6809f0-73d4-4301-ad03-3e659b8b5a61",
      "58d8cc0b-12a3-4dec-883d-771e96baae32",
      "6593d85a-d2ec-4340-8704-66de677b5d69",
      "da26f3f1-48eb-46a6-81c7-9d1f6cc5af93",
    ],
  },
  {
    name: "Transitional Independent Living (TIL)",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: [
      "dd733e25-1442-4306-b745-db3c2dc9b2da",
      "e943b886-1005-49a5-9e71-3825ac87877e",
    ],
  },
  {
    name: "Housing Lottery",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: ["3ac3e688-f033-40e3-bda3-d12e92fcba70"],
  },
  {
    name: "Supportive Housing",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: ["cf8b9dc9-d4db-4232-8fa3-b6907dc6095e"],
  },
  {
    name: "Residential Recovery",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: [
      "bc2056c2-c14e-4a58-a351-4cc37eb861a0",
      "9e821bc0-0a9f-43ca-b2b6-4628e81ca2fc",
    ],
  },
  {
    name: "Cooling Center",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: ["a6f596ae-878c-4829-90fd-f67d99cca10b"],
  },
  {
    name: "Referral",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: [
      "6435c9fd-eb71-4806-abce-6fa0feb7124c",
      "7011c427-1188-406c-9fc4-2f706fe97899",
      "39cbb9db-7bc8-45c0-80f6-e5beccb2c0d4",
      "bf7ad853-360e-4c08-8f16-5f2b7205da46",
      "7f3d3b57-c901-437a-9a69-c2ba11e50f43",
      "700a7e15-fc4a-47f5-ad00-20f027b497b3",
      "113fce1d-01d8-4609-b624-a169d09e2497",
    ],
  },
  {
    name: "Youth",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: [
      "39087b61-55b1-4027-98b7-5dce5b09042f",
      "515f1025-8d78-46f0-a7e4-80fd612dc68d",
      "00251f03-dac4-4ac3-8592-30e24b756c75",
      "3f6d1b5a-284f-446b-9763-610cca4a1b4f",
      "0e9077d5-a563-4c54-89d3-39c7f808b412",
    ],
  },
  {
    name: "Warming Center",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: ["d024c089-4ab5-4428-8d04-5adbe8d02e6d"],
  },
  {
    name: "Veterans",
    parent_name: "Shelter",
    parent_id: "228d5932-634e-48b4-a2bd-d5f0a74730c7",
    services: ["f467f727-6e59-4e32-bbbb-3edd66ab6c07"],
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const taxonomy of taxonomies) {
      const createdTaxonomy = await createInstance(
        "System",
        models.Taxonomy.create.bind(models.Taxonomy),
        taxonomy,
        {
          metadata: {
            source: "migration",
          },
        }
      );

      for (const serviceId of taxonomy.services) {
        const service = await models.Service.findByPk(serviceId);
        if (!service) return;

        const serviceTaxonomy = await models.ServiceTaxonomy.findOne({
          where: {
            service_id: serviceId,
          },
        });

        if (serviceTaxonomy) {
          await destroyInstance("System", serviceTaxonomy, {
            metadata: {
              source: "migration",
            },
          });
        }


        await createInstance(
          "System",
          models.ServiceTaxonomy.create.bind(models.ServiceTaxonomy),
          { service_id: serviceId, taxonomy_id: createdTaxonomy.id },
          {
            metadata: {
              source: "migration",
            },
          }
        );
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const taxonomyNames = taxonomies.map((t) => t.name);

    const database_taxonomies = await models.Taxonomy.findAll({
      where: {
        name: taxonomyNames,
      },
    });

    for (const taxonomy of database_taxonomies) {
      await destroyInstance("<System>", taxonomy, {
        metadata: {
          source: "migration",
        },
      });
    }

    const serviceTaxonomies = await models.ServiceTaxonomy.findAll({
      where: {
        taxonomy_id: database_taxonomies.map((t) => t.id),
      },
    });

    for (const serviceTaxonomy of serviceTaxonomies) {
      await destroyInstance("<System>", serviceTaxonomy, {
        metadata: {
          source: "migration",
        },
      });
    }
  },
};
