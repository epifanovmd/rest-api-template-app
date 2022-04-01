import chai from "chai";
import chaiHttp from "chai-http";
import { server } from "../../server";

chai.use(chaiHttp);
describe("Users", () => {
  beforeEach(done => {
    // await Users.destroy({});
    done();
  });
  /*
   * Тест для /GET
   */
  describe("/GET users", () => {
    it("it should GET all the users", done => {
      chai
        .request(server)
        .get("/api/users")
        .end((err, res) => {
          res.should.have.status(200);
          // res.body.should.be.a("array");
          // res.body.length.should.be.eql(0);
          done();
        });
    });
  });
});
