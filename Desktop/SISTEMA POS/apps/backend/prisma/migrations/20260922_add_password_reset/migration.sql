-- AddColumn resetPasswordToken and resetPasswordExpires to Usuario table
ALTER TABLE "usuarios" ADD COLUMN "resetPasswordToken" TEXT,
ADD COLUMN "resetPasswordExpires" TIMESTAMP(3);
