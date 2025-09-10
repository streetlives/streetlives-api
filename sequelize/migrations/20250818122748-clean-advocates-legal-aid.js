import models from '../../src/models';
import { destroyInstance } from '../../src/services/data-changes';

const serviceTaxonomyMappings = [
  //   Advocates / Legal Aid
  { service_id: 'd5a6ae91-55b4-44ad-9242-15a84e1b77a0', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'cd308ba7-ecea-42cc-8abb-f2fe18b4726d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '773320c6-7bb3-4e65-aafc-1636917cc263', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7e0a83a0-2302-4f7b-b2a8-b70dddf00361', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7cedfd5d-284f-48e0-b262-ec16d2505c5d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'd39ce72f-d7bf-4ca8-aa9f-f3f5a58edbfc', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'd26ccd06-81c4-455e-a2fa-d3e42239a215', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '2e3ea521-9ec7-44f5-9599-a1e3c00efabf', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '9ee7acb0-37d8-40e3-9092-fb0ca4f2158b', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '4bdc1ba4-4846-4cf0-a054-814a78b7564d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '8a1f8e88-baa9-42d4-981a-414674fe3c0e', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '258c186d-d699-4343-a2c9-31a8cd873ace', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '037e2e73-29b7-44e1-99d8-9341dba78649', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '85233b4b-fe54-4c63-a6fb-3388d12b0a83', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'abeacecf-0afa-4d4a-a91f-1367a4011a07', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '18db159e-1b8d-4900-9b55-14c4ac12d36d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '4ad50cc0-9e2d-46e9-866d-5a68ea5c597f', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '56a19079-7d9f-48ca-be35-0abed87440a2', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '057d0e53-92ae-496b-960c-7f4723026afc', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '4bd7acf0-2821-4285-968b-c6c63d389e03', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '4846256d-98a4-488d-bfa6-9ce1e58e5cf0', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'e5383acb-bb20-4665-a7cb-409aa855aa91', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'e14f609d-8f3e-449e-8966-6c205dcdb7f5', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '3c4f9665-f8c5-4b85-8e14-00214887316a', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'b88523ff-8702-409b-9f9f-029fb87b66a8', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '8ded274b-2fc6-4a69-b936-9d54be042d87', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '20defa10-79da-428c-97bf-93c72308bcf3', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'f58eaad6-5fdd-4ce4-a626-4b5b11d9016f', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'd7a3f526-54dd-496b-a804-6cbcfb0c5bc8', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'a62cade5-77e2-41d1-86c8-e8d8917d1a15', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '1e76a1ef-489f-4ab1-b0c9-12aa785aa13d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'daedbae4-e975-4536-9393-0a62030b5cdb', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'b3ac9f39-9bae-470e-9511-9bf71bb7fa62', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '32e78d50-9093-4798-8ce2-0c526945cbf4', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '2e5ebebd-17b7-4401-b1c2-ec1e282c1f37', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7d595a08-93c7-4180-b888-008d303dd710', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7438f7ff-90b8-4b0e-820b-681044c4646c', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '5dc330cb-7772-4921-adcc-f80d73552090', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'fca6d951-50e8-44e2-8097-2b78e100ffe7', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'ed9dec29-8662-4727-ab72-dbd606a30126', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'ecae7186-2a27-4f33-8dce-7c09be22fb57', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '38575864-eebd-44a6-aeb8-c99d483bbd82', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '721cf020-5f95-4d76-9076-e74f5437060d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'd1838fba-6ff2-4181-bd7f-4252ffe0e254', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'b272c2f9-2673-45f6-ba10-63974a570ffc', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '2d28f7e5-f092-4822-a7f7-f2543a03a75e', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '846b0b29-ca44-49b8-b59a-085df7ca834b', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7cb7e243-ea23-4d1b-b9c9-18fc013c9de4', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'fe1a0218-c89b-4230-acdc-5451f77a0bf3', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '2711f96b-4ea1-43e3-af2c-bfffe613bb16', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '45aabe2c-6c06-4301-810d-fb732f2d8c2f', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'b1c4bc27-f69c-45a0-b6af-01030bc065e8', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7b25b833-6ae0-46ef-b810-dbdb6e2c21ed', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'fc088229-5f15-4fba-825e-dd35119f2398', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'c049405e-a53a-4184-9da2-c67bcb935a76', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '9b7aaa68-ae7a-427b-9eb0-a002582c6953', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '732957e8-d0f3-44cb-a8fc-b22d0c6164f9', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'b0fc7293-80b6-4fd0-a6b3-9a5d315972e3', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'f6de8ecc-e1cd-46a2-95c5-42585354e53a', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '819ca0e8-91f7-4206-9f73-df64fa6aec75', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '5a359b99-c625-49db-a33e-500ef3b19f74', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '84a8c5f9-e308-4886-966f-09d1df65761f', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '39b2260d-066b-44cb-b512-3dc5e33fb33d', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7ccf7c8e-d8b9-49ed-b2fc-456707e0a120', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '543bf1c3-fa9e-46b4-84f0-e06f6f248125', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: 'f3273032-49c9-4c0f-ae4f-227dc6283ac7', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '22357361-da1c-4604-bcfd-d4f7e000ef49', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '9696825b-0a93-42a6-be2f-72150cf975d8', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '163c9e27-64ff-4527-88f3-d4c1743a6aac', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '0c07071e-b965-4554-8e21-420e6edc9590', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '035b039a-a084-4541-938f-01ed5f8550e7', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '10ccd938-1e51-4f29-8a65-ff06746d54ba', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '18e27155-3e9b-4af4-8cd1-27cc6c2020cd', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '1407c1a2-d748-4394-b291-c2f54220fb30', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '09d2b319-e2a5-4510-9abd-22cbefc1b227', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '184646b6-8032-425f-a5db-ff3ba111b16c', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '03f8a0d6-8a0a-444b-82f0-ccabb5b8c2c2', taxonomy_name: 'Advocates / Legal Aid' },
  { service_id: '7da03408-416e-4129-a2e2-8cb66bd028b4', taxonomy_name: 'Advocates / Legal Aid' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const legalAidTaxonomy = await models.Taxonomy.findOne({
      where: { name: 'Advocates / Legal Aid' },
    });

    for (const { service_id } of serviceTaxonomyMappings) {
      const serviceTaxonomies = await models.ServiceTaxonomy.findAll({
        where: {
          service_id,
        },
      });

      for (const serviceTaxonomy of serviceTaxonomies) {
        if (serviceTaxonomy.taxonomy_id === legalAidTaxonomy.id) {
          await destroyInstance('System', serviceTaxonomy);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
  },
};
